/**
 * @file 工程初始化命令装配入口
 * @module cmd/init-project
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { logToVssmToolChannel, logErrorToVssmToolChannel } from '../../helpers/utils';
import { copyTemplateTree } from './copier';
import { PROJECT_TEMPLATES, projectTypes } from './templates';

/**
 * @brief 从内置模板初始化工程
 * @details 将扩展内置模板目录下的所有文件及目录拷贝到工作区根目录，
 *          其中特殊目标按映射表改名拷贝，其余条目按同名拷贝。
 *          若目标位置已存在同名文件或目录则跳过。
 *          拷贝完成后执行模板的 postCopy 钩子（如有）——
 *          无论全新初始化还是部分文件已存在，都交给钩子自行判断处理
 *          （如 npm-package：新 package.json 全量刷新依赖；已存在则字段合并）。
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
 *          新增项目类型时只需扩展 templates.ts 的 projectTypes 与 PROJECT_TEMPLATES，
 *          无需改本函数。
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
