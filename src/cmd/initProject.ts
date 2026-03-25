import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { logToVssmToolChannel, logErrorToVssmToolChannel } from '../helpers/utils';

const projectTypes = [
  { label: 'C (VSCode)', value: 'c-vscode', description: 'Initialize a C project with VSCode configuration' },
  { label: 'CNB', value: 'cnb', description: 'Initialize CNB CI/CD configuration' }
];

/**
 * @brief 初始化指定类型的项目工程
 * @details 将扩展内置模板目录src/template/<templateValue>/下的所有文件及目录直接拷贝到工作区根目录。
 *          若目标位置已存在同名文件或目录则跳过。
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

  if (!fs.existsSync(templateDir)) {
    logErrorToVssmToolChannel(`Template directory not found: ${templateDir}`);
    vscode.window.showErrorMessage(`Template "${templateValue}" not found in extension.`);
    return;
  }

  try {
    const entries = fs.readdirSync(templateDir);
    let skipped = false;
    let copied = false;

    for (const entry of entries) {
      const srcPath = path.join(templateDir, entry);
      const destPath = path.join(targetRoot, entry);

      if (fs.existsSync(destPath)) {
        skipped = true;
        continue;
      }

      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
      copied = true;
    }

    if (copied) {
      logToVssmToolChannel(`Successfully initialized ${templateLabel} project in: ${targetRoot}`);
      vscode.window.showInformationMessage(`${templateLabel} project initialized successfully!`);
    } else if (skipped) {
      vscode.window.showWarningMessage(`${templateLabel} files already exist, skipping initialization.`);
    }
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

    if (selected.value === 'cnb') {
      initCnbProject(context, selected.label);
    } else {
      initProject(context, selected.value, selected.label);
    }
  });
  context.subscriptions.push(initDisposable);

  // Register individual project type commands for the submenu
  for (const pt of projectTypes) {
    const cmdId = `vssm-tool.initProject.${pt.value}`;
    const disposable = vscode.commands.registerCommand(cmdId, () => {
      if (pt.value === 'cnb') {
        initCnbProject(context, pt.label);
      } else {
        initProject(context, pt.value, pt.label);
      }
    });
    context.subscriptions.push(disposable);
  }

  return 'vssm-tool.initProject';
}

/**
 * @brief 初始化CNB项目配置
 * @details 将扩展内置模板目录src/template/cnb/下的所有文件（不包含cnb这一层目录）拷贝到工作区根目录。
 *          若目标位置已存在同名文件则跳过。
 * @param context VS Code扩展上下文，用于获取扩展路径等信息
 * @param templateLabel 项目类型的显示标签，用于日志和提示信息
 * @return 无返回值
 */
function initCnbProject(context: vscode.ExtensionContext, templateLabel: string): void {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder is open. Please open a folder first.');
    return;
  }

  const targetRoot = workspaceFolders[0].uri.fsPath;
  const templateDir = path.resolve(__dirname, '..', 'template', 'cnb');

  if (!fs.existsSync(templateDir)) {
    logErrorToVssmToolChannel(`Template directory not found: ${templateDir}`);
    vscode.window.showErrorMessage(`Template "cnb" not found in extension.`);
    return;
  }

  try {
    const entries = fs.readdirSync(templateDir);
    let skipped = false;
    let copied = false;

    for (const entry of entries) {
      const srcPath = path.join(templateDir, entry);
      const destPath = path.join(targetRoot, entry);

      if (fs.existsSync(destPath)) {
        skipped = true;
        continue;
      }

      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
      copied = true;
    }

    // Copy DefaultTemplate.editorconfig as .editorconfig
    const editorconfigSrc = path.resolve(__dirname, '..', 'DefaultTemplate.editorconfig');
    const editorconfigDest = path.join(targetRoot, '.editorconfig');
    if (fs.existsSync(editorconfigSrc) && !fs.existsSync(editorconfigDest)) {
      fs.copyFileSync(editorconfigSrc, editorconfigDest);
      copied = true;
    } else if (fs.existsSync(editorconfigDest)) {
      skipped = true;
    }

    if (copied) {
      logToVssmToolChannel(`Successfully initialized ${templateLabel} project in: ${targetRoot}`);
      vscode.window.showInformationMessage(`${templateLabel} project initialized successfully!`);
    } else if (skipped) {
      vscode.window.showWarningMessage(`${templateLabel} files already exist, skipping initialization.`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logErrorToVssmToolChannel(`Failed to initialize CNB project: ${message}`);
    vscode.window.showErrorMessage(`Failed to initialize CNB project: ${message}`);
  }
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
