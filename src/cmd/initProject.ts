import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { logToVssmToolChannel, logErrorToVssmToolChannel } from '../helpers/utils';

const projectTypes = [
  { label: 'C (VSCode)', value: 'c-vscode', description: 'Initialize a C project with VSCode configuration' }
];

/**
 * @brief 初始化指定类型的项目工程
 * @details 检查工作区根目录下是否已存在.vscode目录，若已存在则跳过；
 *          否则从扩展内置模板目录拷贝对应项目类型的模板文件到.vscode目录。
 * @param context VS Code扩展上下文，用于获取扩展路径等信息
 * @param templateValue 模板目录名称，对应src/template/下的子目录名（如"c-vscode"）
 * @param templateLabel 项目类型的显示标签，用于日志和提示信息（如"C (VSCode)"）
 * @return 无返回值
 */
function initProject(context: vscode.ExtensionContext, templateValue: string, templateLabel: string): void {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder is open. Please open a folder first.');
    return;
  }

  const targetRoot = workspaceFolders[0].uri.fsPath;
  const templateDir = path.resolve(__dirname, '..', 'template', templateValue);
  const targetDir = path.join(targetRoot, '.vscode');

  if (fs.existsSync(targetDir)) {
    vscode.window.showWarningMessage(`.vscode directory already exists, skipping initialization.`);
    return;
  }

  if (!fs.existsSync(templateDir)) {
    logErrorToVssmToolChannel(`Template directory not found: ${templateDir}`);
    vscode.window.showErrorMessage(`Template "${templateValue}" not found in extension.`);
    return;
  }

  try {
    copyDirSync(templateDir, targetDir);
    logToVssmToolChannel(`Successfully initialized ${templateLabel} project in: ${targetRoot}`);
    vscode.window.showInformationMessage(`${templateLabel} project initialized successfully!`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
  // Register the main init command (shows QuickPick)
  const initDisposable = vscode.commands.registerCommand('vssm-tool.initProject', async () => {
    const selected = await vscode.window.showQuickPick(projectTypes, {
      placeHolder: 'Select project type to initialize',
      title: 'Init Project'
    });

    if (!selected) {
      return;
    }

    initProject(context, selected.value, selected.label);
  });
  context.subscriptions.push(initDisposable);

  // Register individual project type commands for the submenu
  for (const pt of projectTypes) {
    const cmdId = `vssm-tool.initProject.${pt.value}`;
    const disposable = vscode.commands.registerCommand(cmdId, () => {
      initProject(context, pt.value, pt.label);
    });
    context.subscriptions.push(disposable);
  }

  return 'vssm-tool.initProject';
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
    fs.copyFileSync(src, dest);
    return;
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src);
  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const entryStat = fs.statSync(srcPath);

    if (entryStat.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
