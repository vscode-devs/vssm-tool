import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { logToVssmToolChannel, logErrorToVssmToolChannel, withFileRetry } from '../helpers/utils';
import {
  fetchLatestNpmVersion,
  fetchLatestNpmVersionInMajor,
  mergePackageJsonTemplate,
  refreshDevDependencyVersions
} from '../helpers/npmRegistry';

const projectTypes = [
  { label: 'C (VSCode)', value: 'c-vscode', description: 'Initialize a C project with VSCode configuration' },
  { label: 'CNB', value: 'cnb', description: 'Initialize CNB CI/CD configuration' },
  {
    label: 'NPM Package',
    value: 'npm-package',
    description: 'Initialize an ESM npm package with TypeScript/ESLint/Prettier'
  }
];

/**
 * @brief 工程模板配置
 * @interface ProjectTemplateConfig
 * @property templateRelPath 模板目录（相对运行时资源根 out/）
 * @property specialTargets 特殊目标名 → 源文件（相对运行时资源根）的映射表
 * @property postCopy 可选拷贝后处理钩子（携带模板与目标路径及拷贝明细）
 */
interface ProjectTemplateConfig {
  templateRelPath: string;
  specialTargets: Record<string, string>;
  postCopy?(ctx: TemplatePostCopyContext): Promise<void>;
}

/**
 * @brief postCopy 钩子上下文
 * @interface TemplatePostCopyContext
 * @property resourceRoot 运行时资源根目录
 * @property templateDir 本次使用的模板目录绝对路径
 * @property targetRoot 工作区根目录绝对路径
 * @property report 拷贝明细报告
 */
interface TemplatePostCopyContext {
  resourceRoot: string;
  templateDir: string;
  targetRoot: string;
  report: TemplateCopyReport;
}

/**
 * @brief 拷贝明细报告（供 postCopy 钩子区分"全新创建"与"目标已存在"）
 * @interface TemplateCopyReport
 * @property created 本次实际创建的相对路径列表
 * @property existed 因已存在而跳过的相对路径列表
 */
export interface TemplateCopyReport {
  created: string[];
  existed: string[];
}

/**
 * @brief C工程初始化的特殊目标名映射表
 * @details 键为工作区目标文件名，值为源文件路径（相对运行时资源根目录 out/）。
 *          列入此表的目标不从模板目录按原名拷贝，而是从指定源文件拷贝到目标名。
 *          - .clang-format：与单独生成命令共用 DefaultTemplate.clang-format，保证同一份C语言模板；
 *          - .gitignore：源文件命名为 C.gitignore，避免在扩展仓库中被当作忽略文件；
 *          - README.md：从扩展内置 DefaultTemplate.README.md 拷贝。
 */
const cVscodeSpecialTargets: Record<string, string> = {
  '.clang-format': 'DefaultTemplate.clang-format',
  '.gitignore': path.join('template', 'c-vscode', 'C.gitignore'),
  'README.md': 'DefaultTemplate.README.md'
};

/**
 * @brief CNB工程初始化的特殊目标名映射表
 * @details .editorconfig 从扩展内置的 DefaultTemplate.editorconfig 拷贝，与单独生成命令共用同一份模板；
 *          README.md 从扩展内置的 DefaultTemplate.README.md 拷贝。
 */
const cnbSpecialTargets: Record<string, string> = {
  '.editorconfig': 'DefaultTemplate.editorconfig',
  'README.md': 'DefaultTemplate.README.md'
};

/**
 * @brief 各项目类型的模板配置表
 * @details 新增项目类型只需在此登记，注册流程按 projectTypes 循环自动生效。
 */
const PROJECT_TEMPLATES: Record<string, ProjectTemplateConfig> = {
  'c-vscode': { templateRelPath: path.join('template', 'c-vscode'), specialTargets: cVscodeSpecialTargets },
  cnb: { templateRelPath: path.join('template', 'cnb'), specialTargets: cnbSpecialTargets },
  'npm-package': {
    templateRelPath: path.join('template', 'npm-package'),
    specialTargets: {},
    // 拷贝后处理：
    // - package.json 为全新创建 → devDependencies 全量刷新为生成时刻最新版本
    // - package.json 已存在 → 字段级合并（缺则补、有不覆），仅对新增依赖做版本刷新
    postCopy: async (ctx) => {
      const pkgRel = 'package.json';
      const targetPkgPath = path.join(ctx.targetRoot, pkgRel);
      if (!fs.existsSync(targetPkgPath)) {
        return;
      }

      const created = ctx.report.created.includes(pkgRel);
      let onlyNewDeps: Set<string> | undefined;

      if (!created) {
        const merge = mergePackageJsonTemplate(path.join(ctx.templateDir, pkgRel), targetPkgPath);
        if (merge.changed) {
          vscode.window.showInformationMessage(
            `package.json 已合并：新增 ${merge.addedTopLevelFields.length} 个字段、` +
              `${merge.addedScripts.length} 个脚本、${merge.addedDevDependencies.length} 个依赖；已有内容保持不变。`
          );
          onlyNewDeps = new Set(merge.addedDevDependencies);
        } else {
          // 目标与模板字段完全一致，无需任何处理
          return;
        }
      }

      // typescript 上限锁在 5.x 大版本：@typescript-eslint 8.x 的 peer 约束为 <6.1.0，
      // 盲取 latest 会装出 TS7 导致 npm install 直接失败；待生态支持后移除该上限
      const fetcher = async (name: string) =>
        name === 'typescript' ? fetchLatestNpmVersionInMajor(name, 5) : fetchLatestNpmVersion(name);

      const { updated, total } = await refreshDevDependencyVersions(targetPkgPath, fetcher, onlyNewDeps);
      if (total > 0 && updated === total) {
        vscode.window.showInformationMessage(`已将 ${updated} 个 devDependencies 更新为最新版本。`);
      } else if (updated === 0) {
        vscode.window.showWarningMessage('未能连接 npm registry，devDependencies 保留模板内置版本范围。');
      } else {
        vscode.window.showWarningMessage(`${total - updated} 个依赖未获取到最新版本，已保留模板内置范围。`);
      }
    }
  }
};

/**
 * @brief 从内置模板初始化工程
 * @details 将扩展内置模板目录下的所有文件及目录拷贝到工作区根目录，
 *          其中特殊目标按映射表改名拷贝，其余条目按同名拷贝。
 *          若目标位置已存在同名文件或目录则跳过。
 *          拷贝成功后执行模板的 postCopy 钩子（如有）。
 * @param resourceRoot 运行时资源根目录（out/）的绝对路径
 * @param projectType 项目类型标识（PROJECT_TEMPLATES 的键）
 * @param templateLabel 项目类型的显示标签，用于日志和提示信息
 * @return 无返回值
 */
async function initProjectFromTemplate(
  resourceRoot: string,
  projectType: string,
  templateLabel: string
): Promise<void> {
  const config = PROJECT_TEMPLATES[projectType];
  if (!config) {
    vscode.window.showErrorMessage(`Unknown project type: ${projectType}`);
    return;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder is open. Please open a folder first.');
    return;
  }

  const targetRoot = workspaceFolders[0].uri.fsPath;
  const templateDir = path.join(resourceRoot, config.templateRelPath);

  if (!fs.existsSync(templateDir)) {
    logErrorToVssmToolChannel(`Template directory not found: ${templateDir}`);
    vscode.window.showErrorMessage(`Template "${projectType}" not found in extension.`);
    return;
  }

  try {
    const result = copyTemplateTree(templateDir, targetRoot, resourceRoot, config.specialTargets);

    if (result.copied) {
      logToVssmToolChannel(`Successfully initialized ${templateLabel} project in: ${targetRoot}`);
      vscode.window.showInformationMessage(`${templateLabel} project initialized successfully!`);
    } else if (result.skipped) {
      vscode.window.showWarningMessage(`${templateLabel} files already exist, merging/skipping existing files.`);
    }

    // 无论全新初始化还是部分文件已存在，都交给钩子自行判断处理
    // （如 npm-package：新 package.json 全量刷新依赖；已存在则字段合并）
    await config.postCopy?.({ resourceRoot, templateDir, targetRoot, report: result.report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // console.error 便于在 Extension Host 测试等无 UI 场景暴露失败原因
    console.error(`[initProject] Failed to initialize ${templateLabel} project:`, message);
    logErrorToVssmToolChannel(`Failed to initialize project: ${message}`);
    vscode.window.showErrorMessage(`Failed to initialize project: ${message}`);
  }
}

/**
 * @brief 注册项目初始化相关的所有命令
 * @details 注册一个主命令vssm-tool.initProject（弹出QuickPick让用户选择项目类型），
 *          并为每种项目类型动态注册对应的子命令（如vssm-tool.initProject.c-vscode），
 *          用于右键子菜单直接选择项目类型。
 *          新增项目类型时只需扩展 projectTypes 与 PROJECT_TEMPLATES，无需改本函数。
 * @param context VS Code扩展上下文，用于注册命令到context.subscriptions
 * @return 返回主命令的命令ID字符串"vssm-tool.initProject"
 */
export function registerInitProjectCommand(context: vscode.ExtensionContext): string {
  // 运行时资源根：postbuild 将 DefaultTemplate.* 与 src/template 拷贝到 out/，
  // 开发态与安装态一致，故统一以 out/ 为资源根解析（避免模块内部反推位置）
  const resourceRoot = context.asAbsolutePath('out');

  // Register the main init command (shows QuickPick)
  const initDisposable = vscode.commands.registerCommand('vssm-tool.initProject', async () => {
    const selected = await vscode.window.showQuickPick(projectTypes, {
      placeHolder: 'Select project type to initialize',
      title: 'Init Project'
    });

    if (!selected) {
      return;
    }

    await initProjectFromTemplate(resourceRoot, selected.value, selected.label);
  });
  context.subscriptions.push(initDisposable);

  // Register individual project type commands for the submenu
  for (const pt of projectTypes) {
    const cmdId = `vssm-tool.initProject.${pt.value}`;
    const disposable = vscode.commands.registerCommand(cmdId, () =>
      // 返回 Promise：让 executeCommand 可等待初始化（含 postCopy）完成
      initProjectFromTemplate(resourceRoot, pt.value, pt.label)
    );
    context.subscriptions.push(disposable);
  }
  return 'vssm-tool.initProject';
}

/**
 * @brief 模板目录拷贝结果
 * @interface TemplateCopyResult
 * @property copied 是否至少成功拷贝了一个文件或目录
 * @property skipped 是否存在因目标已存在而被跳过的情况
 * @property report 拷贝明细（新建/已存在的相对路径）
 */
interface TemplateCopyResult {
  copied: boolean;
  skipped: boolean;
  report: TemplateCopyReport;
}

/**
 * @brief 将模板目录拷贝到工作区根目录，支持特殊目标名映射
 * @details 先遍历 templateDir 下所有文件及目录，按原名拷贝到 targetRoot；
 *          再按 specialTargets 将指定源文件拷贝为目标名。
 *          specialTargets 的键为目标文件名，值为源文件路径（相对运行时资源根目录 out/）。
 *          若某特殊目标的源文件恰好位于 templateDir 内，则在常规遍历时自动跳过，避免重复拷贝。
 *          目标位置已存在同名文件或目录时跳过。
 * @param templateDir 模板目录的绝对路径
 * @param targetRoot 工作区根目录的绝对路径
 * @param extensionRoot 运行时资源根目录（out/）的绝对路径（解析 specialTargets 源文件用）
 * @param specialTargets 特殊目标名到源文件（相对运行时资源根目录 out/）的映射表
 * @return 返回拷贝结果
 */
function copyTemplateTree(
  templateDir: string,
  targetRoot: string,
  extensionRoot: string,
  specialTargets: Record<string, string>
): TemplateCopyResult {
  // 收集位于模板目录内的特殊源文件名，常规遍历时跳过这些条目（避免重复拷贝）
  const skipInTemplate = new Set<string>();
  for (const srcRel of Object.values(specialTargets)) {
    const srcAbs = path.resolve(extensionRoot, srcRel);
    if (srcAbs.startsWith(`${templateDir}${path.sep}`)) {
      skipInTemplate.add(path.basename(srcAbs));
    }
  }

  let skipped = false;
  let copied = false;
  const report: TemplateCopyReport = { created: [], existed: [] };

  // 1) 常规拷贝：模板目录中未被特殊处理的条目按原名拷贝。
  //    逐条容错：单个条目失败（如被占用）只跳过该项，不中断整体初始化
  for (const entry of fs.readdirSync(templateDir)) {
    if (skipInTemplate.has(entry)) {
      continue;
    }

    const srcPath = path.join(templateDir, entry);
    const destPath = path.join(targetRoot, entry);

    if (fs.existsSync(destPath)) {
      skipped = true;
      report.existed.push(entry);
      continue;
    }

    try {
      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        copyDirSync(srcPath, destPath);
      } else {
        withFileRetry(() => fs.copyFileSync(srcPath, destPath));
      }
      copied = true;
      report.created.push(entry);
    } catch (err) {
      console.error(`[initProject] Skip "${entry}":`, err instanceof Error ? err.message : err);
      skipped = true;
    }
  }

  // 2) 特殊目标：从指定源文件拷贝到对应目标名（同样逐条容错）
  for (const [destName, srcRel] of Object.entries(specialTargets)) {
    const srcAbs = path.resolve(extensionRoot, srcRel);
    const destPath = path.join(targetRoot, destName);

    if (fs.existsSync(destPath)) {
      skipped = true;
      report.existed.push(destName);
      continue;
    }

    if (!fs.existsSync(srcAbs)) {
      continue;
    }

    try {
      withFileRetry(() => fs.copyFileSync(srcAbs, destPath));
      copied = true;
      report.created.push(destName);
    } catch (err) {
      console.error(`[initProject] Skip special target "${destName}":`, err instanceof Error ? err.message : err);
      skipped = true;
    }
  }

  return { copied, skipped, report };
}

/**
 * @brief 同步递归拷贝目录或文件
 * @details 将源路径下的目录或文件递归拷贝到目标路径。若源路径为文件则直接复制；
 *          若为目录则递归创建子目录并复制所有内容。
 * @param src 源文件或源目录的绝对路径
 * @param dest 目标文件或目标目录的绝对路径
 * @return 无返回值
 * @throws 当源路径不存在时抛出Error
 */
function copyDirSync(src: string, dest: string): void {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }

  const stat = fs.statSync(src);
  if (!stat.isDirectory()) {
    withFileRetry(() => fs.copyFileSync(src, dest));
    return;
  }

  // recursive mkdir 目标已存在时安全无操作；瞬态 EPERM 由重试兜底
  withFileRetry(() => fs.mkdirSync(dest, { recursive: true }));

  const entries = fs.readdirSync(src);
  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const entryStat = fs.statSync(srcPath);

    if (entryStat.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      withFileRetry(() => fs.copyFileSync(srcPath, destPath));
    }
  }
}
