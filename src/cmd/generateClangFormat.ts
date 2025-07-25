import { readFile as _readFile } from 'fs';
import { resolve } from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { FileType, Uri, window, workspace } from 'vscode';

const readFile = promisify(_readFile);

/**
 * @brief 生成.clang-format文件
 * @param uri 目标文件夹的URI
 * @description 根据模板生成.clang-format文件
 */
async function generateClangFormat(uri: Uri) {
  // 获取当前工作区第一个文件夹的URI，如果没有则使用传入的URI
  const workspaceUri = workspace.workspaceFolders?.[0].uri;
  // 优先使用传入的URI，如果没有则使用工作区URI
  const currentUri = uri || workspaceUri;

  // 检查是否有有效的URI
  if (!currentUri) {
    window.showErrorMessage("Workspace doesn't contain any folders.");
    return;
  }

  // 构造.clang-format文件的URI路径
  const clangFormatUri = Uri.parse(`${currentUri.toString()}/.clang-format`);

  try {
    // 检查.clang-format文件是否已存在
    const stats = await workspace.fs.stat(clangFormatUri);
    if (stats.type === FileType.File) {
      window.showErrorMessage(
        'A .clang-format file already exists in this workspace.',
      );
      return;
    }
  } catch (err: unknown) {
    // 处理文件不存在的异常情况
    if (
      typeof err === 'object' &&
      err !== null &&
      'name' in err &&
      'message' in err &&
      typeof err.message === 'string'
    ) {
      if (err.name === 'EntryNotFound (FileSystemError)') {
        // 文件不存在，继续写入操作
        writeFile();
      } else {
        // 其他错误显示错误信息
        window.showErrorMessage(err.message);
      }
      return;
    }
  }

  /**
   * @brief 写入.clang-format文件
   * @description 根据模板创建.clang-format文件
   */
  async function writeFile() {
    // 获取 generateClangFormat 相关配置
    const cc = workspace.getConfiguration('generateClangFormat');
    // 获取自定义模板路径配置
    const customTemplatePath = cc.get<string>('customTemplatePath');
    // 获取模板配置，默认为'default'
    const template = cc.get<string>('template') || 'default';
    // 解析默认模板路径
    const defaultTemplatePath = resolve(
      __dirname,
      '..',
      'DefaultTemplate.clang-format',
    );

    let templateBuffer: Buffer;
    try {
      // 优先检查自定义模板路径是否存在
      let templatePath = defaultTemplatePath;
      if (customTemplatePath) {
        try {
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
      if (
        typeof error !== 'object' ||
        error === null ||
        !('message' in error) ||
        typeof error.message !== 'string'
      ) {
        return;
      }
      window.showErrorMessage(
        [
          `Could not read clang-format template file at ${template}`,
          error.message,
        ].join('\n'),
      );
      return;
    }

    try {
      // 将模板内容写入.clang-format文件
      await workspace.fs.writeFile(clangFormatUri, templateBuffer);
    } catch (error) {
      // 处理文件写入错误
      if (
        typeof error !== 'object' ||
        error === null ||
        !('message' in error) ||
        typeof error.message !== 'string'
      ) {
        return;
      }
      window.showErrorMessage(error.message);
    }
  }
}

/**
 * @brief 注册生成.clang-format文件的命令
 * @param context VSCode扩展上下文
 */
export function registerGenerateClangFormatCommand(context: vscode.ExtensionContext) {
  // 注册命令
  const command = vscode.commands.registerCommand('vssm-tool.generateClangFormat', (uri: Uri) => {
    generateClangFormat(uri);
  });
  // 将命令添加到订阅列表
  context.subscriptions.push(command);
}
