import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { logToVssmToolChannel, logErrorToVssmToolChannel } from '../helpers/utils';

const projectTypes = [
  { label: 'C (VSCode)', value: 'c-vscode', description: 'Initialize a C project with VSCode configuration' },
  { label: 'CNB', value: 'cnb', description: 'Initialize CNB CI/CD configuration' }
];

/**
 * @brief C工程初始化的特殊目标名映射表
 * @details 键为工作区目标文件名，值为源文件路径（相对扩展根目录）。
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
 * @brief 初始化C语言工程
 * @details 将扩展内置模板目录template/c-vscode/下的所有文件及目录拷贝到工作区根目录，
 *          其中 cVscodeSpecialTargets 中配置的目标名（.clang-format、.gitignore）做特殊处理，
 *          其余条目按同名拷贝。若目标位置已存在同名文件或目录则跳过。
 * @param resourceRoot 运行时资源根目录（out/）的绝对路径
 * @param templateLabel 项目类型的显示标签，用于日志和提示信息（如"C (VSCode)"）
 * @return 无返回值
 */
function initCVscodeProject(resourceRoot: string, templateLabel: string): void {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder is open. Please open a folder first.');
    return;
  }

  const targetRoot = workspaceFolders[0].uri.fsPath;
  const templateDir = path.join(resourceRoot, 'template', 'c-vscode');

  if (!fs.existsSync(templateDir)) {
    logErrorToVssmToolChannel(`Template directory not found: ${templateDir}`);
    vscode.window.showErrorMessage(`Template "c-vscode" not found in extension.`);
    return;
  }

  try {
    const result = copyTemplateTree(templateDir, targetRoot, resourceRoot, cVscodeSpecialTargets);

    if (result.copied) {
      logToVssmToolChannel(`Successfully initialized ${templateLabel} project in: ${targetRoot}`);
      vscode.window.showInformationMessage(`${templateLabel} project initialized successfully!`);
    } else if (result.skipped) {
      vscode.window.showWarningMessage(`${templateLabel} files already exist, skipping initialization.`);
    }
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

    if (selected.value === 'cnb') {
      initCnbProject(resourceRoot, selected.label);
    } else {
      initCVscodeProject(resourceRoot, selected.label);
    }
  });
  context.subscriptions.push(initDisposable);

  // Register individual project type commands for the submenu
  for (const pt of projectTypes) {
    const cmdId = `vssm-tool.initProject.${pt.value}`;
    const disposable = vscode.commands.registerCommand(cmdId, () => {
      if (pt.value === 'cnb') {
        initCnbProject(resourceRoot, pt.label);
      } else {
        initCVscodeProject(resourceRoot, pt.label);
      }
    });
    context.subscriptions.push(disposable);
  }
  return 'vssm-tool.initProject';
}

/**
 * @brief 初始化CNB项目配置
 * @details 将扩展内置模板目录template/cnb/下的所有文件（不包含cnb这一层目录）拷贝到工作区根目录，
 *          其中 cnbSpecialTargets 中配置的目标名（.editorconfig）从扩展内置 DefaultTemplate.editorconfig 拷贝，
 *          其余条目按同名拷贝。若目标位置已存在同名文件则跳过。
 * @param resourceRoot 运行时资源根目录（out/）的绝对路径
 * @param templateLabel 项目类型的显示标签，用于日志和提示信息
 * @return 无返回值
 */
function initCnbProject(resourceRoot: string, templateLabel: string): void {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder is open. Please open a folder first.');
    return;
  }

  const targetRoot = workspaceFolders[0].uri.fsPath;
  const templateDir = path.join(resourceRoot, 'template', 'cnb');

  if (!fs.existsSync(templateDir)) {
    logErrorToVssmToolChannel(`Template directory not found: ${templateDir}`);
    vscode.window.showErrorMessage(`Template "cnb" not found in extension.`);
    return;
  }

  try {
    const result = copyTemplateTree(templateDir, targetRoot, resourceRoot, cnbSpecialTargets);

    if (result.copied) {
      logToVssmToolChannel(`Successfully initialized ${templateLabel} project in: ${targetRoot}`);
      vscode.window.showInformationMessage(`${templateLabel} project initialized successfully!`);
    } else if (result.skipped) {
      vscode.window.showWarningMessage(`${templateLabel} files already exist, skipping initialization.`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[initProject] Failed to initialize ${templateLabel} project:`, message);
    logErrorToVssmToolChannel(`Failed to initialize CNB project: ${message}`);
    vscode.window.showErrorMessage(`Failed to initialize CNB project: ${message}`);
  }
}

/**
 * @interface TemplateCopyResult
 * @brief 模板目录拷贝结果
 * @property copied 是否至少成功拷贝了一个文件或目录
 * @property skipped 是否存在因目标已存在而被跳过的情况
 */
interface TemplateCopyResult {
  copied: boolean;
  skipped: boolean;
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
      continue;
    }

    if (!fs.existsSync(srcAbs)) {
      continue;
    }

    try {
      withFileRetry(() => fs.copyFileSync(srcAbs, destPath));
      copied = true;
    } catch (err) {
      console.error(`[initProject] Skip special target "${destName}":`, err instanceof Error ? err.message : err);
      skipped = true;
    }
  }

  return { copied, skipped };
}

/**
 * @brief 带重试的同步文件操作
 * @details 规避 Windows 上的瞬态错误：目标刚被删除即重建（EPERM）、句柄未释放（EBUSY）等。
 *          仅对可重试的错误码重试，其他异常立即抛出。
 * @param op 待执行的同步操作
 * @param attempts 最大尝试次数
 * @param delayMs 每次重试前的等待毫秒数
 * @return 操作返回值；全部尝试失败时抛出最后一次异常
 */
function withFileRetry<T>(op: () => T, attempts = 3, delayMs = 50): T {
  const retriable = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOENT']);
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return op();
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException)?.code;
      if (!code || !retriable.has(code)) {
        throw err;
      }
      // 同步上下文阻塞等待（Node 主线程可用 Atomics.wait）
      try {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
      } catch {
        /* 不支持时退化为立即重试 */
      }
    }
  }
  throw lastErr;
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
