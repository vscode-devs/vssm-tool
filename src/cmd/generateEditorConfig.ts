import { readFile as _readFile } from 'fs';
import { EOL } from 'os';
import { resolve } from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { FileType, Uri, window, workspace } from 'vscode';

const readFile = promisify(_readFile);

/**
 * @brief 生成.editorconfig文件
 * @param uri 目标文件夹的URI
 * @description 根据当前VSCode设置生成.editorconfig文件
 */
async function generateEditorConfig(uri: Uri) {
  // 获取当前工作区第一个文件夹的URI，如果没有则使用传入的URI
  const workspaceUri = workspace.workspaceFolders?.[0].uri;
  // 优先使用传入的URI，如果没有则使用工作区URI
  const currentUri = uri || workspaceUri;

  // 检查是否有有效的URI
  if (!currentUri) {
    window.showErrorMessage("Workspace doesn't contain any folders.");
    return;
  }

  // 构造.editorconfig文件的URI路径
  const editorConfigUri = Uri.parse(`${currentUri.toString()}/.editorconfig`);

  try {
    // 检查.editorconfig文件是否已存在
    const stats = await workspace.fs.stat(editorConfigUri);
    if (stats.type === FileType.File) {
      window.showErrorMessage('An .editorconfig file already exists in this workspace.');
      return;
    }
  } catch (err: unknown) {
    // 处理文件不存在的异常情况
    if (typeof err === 'object' && err !== null && 'name' in err && 'message' in err && typeof err.message === 'string') {
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
   * @brief 写入.editorconfig文件
   * @description 根据配置生成或使用模板创建.editorconfig文件
   */
  async function writeFile() {
    // 获取 generateEditorConfig 相关配置,package.json中
    const ec = workspace.getConfiguration('generateEditorConfig');
    const generateAuto = !!ec.get<boolean>('generateAuto');

    if (!generateAuto) {
      // 获取自定义模板路径配置
      const customTemplatePath = ec.get<string>('customTemplatePath');
      // 获取模板配置，默认为'default'
      const template = ec.get<string>('template') || 'default';
      // 解析默认模板路径
      const defaultTemplatePath = resolve(__dirname, '..', 'DefaultTemplate.editorconfig');

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
        if (typeof error !== 'object' || error === null || !('message' in error) || typeof error.message !== 'string') {
          return;
        }
        window.showErrorMessage([`Could not read EditorConfig template file at ${template}`, error.message].join(EOL));
        return;
      }

      try {
        // 将模板内容写入.editorconfig文件
        workspace.fs.writeFile(editorConfigUri, templateBuffer);
      } catch (error) {
        // 处理文件写入错误
        if (typeof error !== 'object' || error === null || !('message' in error) || typeof error.message !== 'string') {
          return;
        }
        window.showErrorMessage(error.message);
      }

      return;
    }

    // 获取编辑器相关配置
    const editor = workspace.getConfiguration('editor', currentUri);
    // 获取文件相关配置
    const files = workspace.getConfiguration('files', currentUri);
    // 初始化.editorconfig内容
    const settingsLines = ['# EditorConfig is awesome: https://EditorConfig.org', '', '# top-most EditorConfig file', 'root = true', '', '[*]'];

    /**
     * @brief 添加设置项
     * @param key 设置键名
     * @param value 设置值
     */
    function addSetting(key: string, value?: string | number | boolean): void {
      if (value !== undefined) {
        settingsLines.push(`${key} = ${value}`);
      }
    }

    // 添加缩进相关设置
    const insertSpaces = !!editor.get<boolean>('insertSpaces');
    addSetting('indent_style', insertSpaces ? 'space' : 'tab');
    addSetting('indent_size', editor.get<number>('tabSize'));

    // 添加行尾设置
    const eolMap = {
      '\r\n': 'crlf',
      '\n': 'lf'
    };
    let eolKey = files.get<string>('eol') || 'auto';
    if (eolKey === 'auto') {
      eolKey = EOL;
    }
    addSetting('end_of_line', eolMap[eolKey as keyof typeof eolMap]);

    // 添加编码设置
    const encodingMap = {
      iso88591: 'latin1',
      utf8: 'utf-8',
      utf8bom: 'utf-8-bom',
      utf16be: 'utf-16-be',
      utf16le: 'utf-16-le'
    };
    addSetting('charset', encodingMap[files.get<string>('encoding') as keyof typeof encodingMap]);

    // 添加其他设置
    addSetting('trim_trailing_whitespace', !!files.get<boolean>('trimTrailingWhitespace'));

    const insertFinalNewline = !!files.get<boolean>('insertFinalNewline');
    addSetting('insert_final_newline', insertFinalNewline);

    // 如果设置了插入最后换行，则添加空行
    if (insertFinalNewline) {
      settingsLines.push('');
    }

    try {
      // 将生成的配置写入.editorconfig文件
      await workspace.fs.writeFile(editorConfigUri, Buffer.from(settingsLines.join(eolKey)));
    } catch (err) {
      // 处理文件写入错误
      if (typeof err !== 'object' || err === null || !('message' in err) || typeof err.message !== 'string') {
        return;
      }

      window.showErrorMessage(err.message);
    }
  }
}

/**
 * @brief 注册生成.editorconfig文件的命令
 * @param context VSCode扩展上下文
 * @returns 返回注册的命令名称
 */
export function registerGenerateEditorConfigCommand(context: vscode.ExtensionContext): string {
  const commandName = 'vssm-tool.generateEditorConfig';
  // 注册命令
  const command = vscode.commands.registerCommand(commandName, (uri: Uri) => {
    generateEditorConfig(uri);
  });
  // 将命令添加到订阅列表
  context.subscriptions.push(command);
  return commandName;
}
