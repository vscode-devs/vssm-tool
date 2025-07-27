// 导入必要的Node.js和VSCode API模块
import { readFile as _readFile } from 'fs';
import { resolve } from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { FileType, Uri, window, workspace } from 'vscode';

// 将回调式的readFile转换为Promise版本以便使用async/await
const readFile = promisify(_readFile);

/**
 * @brief 生成VSCode工作区配置文件
 * @description 在指定位置创建基于默认模板的.code-workspace文件
 * @param {Uri} uri - 目标文件夹的URI，如果不提供则使用当前工作区的第一个文件夹
 * @throws {Error} 当工作区不包含任何文件夹时显示错误
 * @throws {Error} 当工作区配置文件已存在时显示错误
 */
async function generateWorkspaceConfig(uri: Uri) {
  // 获取当前工作区的URI，如果未传入uri参数则使用工作区的第一个文件夹
  const workspaceUri = workspace.workspaceFolders?.[0].uri;
  const currentUri = uri || workspaceUri;

  // 检查是否获取到了有效的URI
  if (!currentUri) {
    window.showErrorMessage("Workspace doesn't contain any folders.");
    return;
  }

  // 从URI路径中提取文件夹名称，用于生成配置文件名
  const folderName = currentUri.path.split('/').filter(Boolean).pop() || 'workspace';

  // 构造工作区配置文件的完整URI
  const workspaceConfigUri = Uri.parse(`${currentUri.toString()}/${folderName}.code-workspace`);

  try {
    // 检查目标文件是否已存在
    const stats = await workspace.fs.stat(workspaceConfigUri);

    // 如果文件已存在，则显示错误消息并返回
    if (stats.type === FileType.File) {
      window.showErrorMessage(`A ${folderName}.code-workspace file already exists in this workspace.`);
      return;
    }
  } catch (err: unknown) {
    // 处理文件不存在的错误（这是预期情况）和其他可能的错误
    if (typeof err === 'object' && err !== null && 'name' in err && 'message' in err && typeof err.message === 'string') {
      if (err.name === 'EntryNotFound (FileSystemError)') {
        // 文件不存在，可以继续创建
        await writeFile();
      } else {
        // 其他错误显示给用户
        window.showErrorMessage(err.message);
      }
      return;
    }
  }

  /**
   * @brief 内部函数：实际执行文件写入操作
   * @description 读取默认模板并写入到目标位置
   * @throws {Error} 当文件操作失败时显示错误
   */
  async function writeFile() {
    // 获取 generateWorkspaceConfig 相关配置
    const wc = workspace.getConfiguration('generateWorkspaceConfig');
    // 获取自定义模板路径配置
    const customTemplatePath = wc.get<string>('customTemplatePath');
    // 获取模板配置，默认为'default'
    const template = wc.get<string>('template') || 'default';
    // 解析默认模板路径
    const defaultTemplatePath = resolve(__dirname, '..', 'DefaultTemplate.code-workspace');

    let templateBuffer: Buffer;
    try {
      // 优先检查自定义模板路径是否存在
      let templatePath = defaultTemplatePath;
      if (customTemplatePath) {
        try {
          // 尝试读取自定义模板文件，如果成功则使用自定义模板
          await readFile(customTemplatePath);
          templatePath = customTemplatePath;
        } catch {
          // 自定义模板不存在，回退到模板配置
          templatePath = /^default$/i.test(template) ? defaultTemplatePath : template;
        }
      } else {
        // 没有自定义模板配置，使用模板配置
        templatePath = /^default$/i.test(template) ? defaultTemplatePath : template;
      }
      // 读取模板文件内容
      templateBuffer = await readFile(templatePath);
    } catch (error) {
      // 处理模板文件读取错误
      if (typeof error !== 'object' || error === null || !('message' in error) || typeof error.message !== 'string') {
        return;
      }
      window.showErrorMessage(error.message);
      return;
    }

    try {
      // 将模板内容写入.code-workspace文件
      await workspace.fs.writeFile(workspaceConfigUri, templateBuffer);
    } catch (error) {
      // 处理文件写入错误
      if (typeof error !== 'object' || error === null || !('message' in error) || typeof error.message !== 'string') {
        return;
      }
      window.showErrorMessage(error.message);
    }
  }
}

/**
 * @brief 注册生成工作区配置文件的命令
 * @description 注册VSCode命令'vssm-tool.generateWorkspaceConfig'
 * @param {vscode.ExtensionContext} context - VSCode扩展上下文，用于管理命令的生命周期
 * @returns {string} 返回注册的命令名称
 */
export function registerGenerateWorkspaceConfigCommand(context: vscode.ExtensionContext): string {
  const commandName = 'vssm-tool.generateWorkspaceConfig';
  // 注册命令并绑定到generateWorkspaceConfig函数
  const command = vscode.commands.registerCommand(commandName, (uri: Uri) => {
    generateWorkspaceConfig(uri);
  });

  // 将命令添加到扩展上下文的订阅中，确保扩展卸载时命令被清理
  context.subscriptions.push(command);
  return commandName;
}
