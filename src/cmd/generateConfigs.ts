import * as vscode from 'vscode';
import { Uri, window, workspace } from 'vscode';
import { readFile as _readFile } from 'fs';
import { resolve } from 'path';
import { promisify } from 'util';

const readFile = promisify(_readFile); // 将回调式文件读取转换为Promise形式

/**
 * @interface GenerateCommand
 * @brief 配置文件生成命令的配置结构
 * @property {string} fileName - 默认生成的配置文件名
 * @property {function} [fileNameGenerator] - 动态生成文件名的函数
 * @property {string} commandName - VS Code命令的唯一标识符
 * @property {string} menuTitle - 资源管理器右键菜单中显示的标题
 * @property {string} templateName - 模板配置名称（用于settings.json中的配置项）
 * @property {string} defaultTemplatePath - 默认模板文件路径
 * @property {function} [generateAutoContent] - 自动生成文件内容的函数
 */
interface GenerateCommand {
  fileName: string;
  fileNameGenerator?: (uri: Uri) => string;
  commandName: string;
  menuTitle: string;
  templateName: string;
  defaultTemplatePath: string;
  generateAutoContent?: (uri: Uri) => Promise<Buffer>;
}

/**
 * @brief 生成配置文件的核心函数
 * @param {Uri} uri - 目标文件夹的URI
 * @param {GenerateCommand} config - 生成命令配置
 * @async
 */
async function generateConfig(uri: Uri, config: GenerateCommand) {
  // 获取当前工作区根目录URI或右键选择的文件夹URI
  const workspaceUri = workspace.workspaceFolders?.[0].uri;
  const currentUri = uri || workspaceUri;

  // 检查工作区是否有效
  if (!currentUri) {
    window.showErrorMessage("Workspace doesn't contain any folders.");
    return;
  }

  // 确定最终文件名（使用生成器函数或默认名称）
  const fileName = config.fileNameGenerator ? config.fileNameGenerator(currentUri) : config.fileName;
  const configUri = Uri.parse(`${currentUri.toString()}/${fileName}`); // 拼接完整文件URI

  try {
    // 检查文件是否已存在
    const stats = await workspace.fs.stat(configUri);
    if (stats.type === vscode.FileType.File) {
      window.showErrorMessage(`A ${fileName} file already exists in this workspace.`);
      return;
    }
  } catch (err) {
    // 文件不存在时执行写入操作
    if (err instanceof Error && err.name === 'EntryNotFound (FileSystemError)') {
      await writeFile();
    } else {
      // 其他错误处理
      window.showErrorMessage(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  /**
   * @brief 实际执行文件写入的内部函数
   * @async
   */
  async function writeFile() {
    // 优先使用自动内容生成器
    if (config.generateAutoContent) {
      try {
        const content = await config.generateAutoContent(currentUri);
        if (content.length > 0) {
          await workspace.fs.writeFile(configUri, content);
          return;
        }
      } catch (error) {
        window.showErrorMessage(error instanceof Error ? error.message : String(error));
        return;
      }
    }

    // 获取用户配置
    const wc = workspace.getConfiguration(`generate${config.templateName}`);
    const customTemplatePath = wc.get<string>('customTemplatePath'); // 用户自定义模板路径
    const template = wc.get<string>('template') || 'default'; // 选择的模板类型
    const defaultTemplatePath = resolve(__dirname, '..', config.defaultTemplatePath); // 扩展内置模板路径

    let templateBuffer: Buffer;
    try {
      let templatePath = defaultTemplatePath;
      // 处理模板路径选择逻辑
      if (customTemplatePath) {
        try {
          // 验证自定义模板是否存在
          await readFile(customTemplatePath);
          templatePath = customTemplatePath;
        } catch {
          // 回退到默认模板或用户指定的模板
          templatePath = /^default$/i.test(template) ? defaultTemplatePath : template;
        }
      } else {
        // 没有自定义路径时选择模板
        templatePath = /^default$/i.test(template) ? defaultTemplatePath : template;
      }
      // 读取模板内容
      templateBuffer = await readFile(templatePath);
    } catch (error) {
      window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }

    try {
      // 写入最终文件
      await workspace.fs.writeFile(configUri, templateBuffer);
    } catch (error) {
      window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * @brief 注册生成配置文件的VS Code命令
 * @param {vscode.ExtensionContext} context - 扩展上下文对象
 * @param {GenerateCommand} config - 生成命令配置
 * @returns {string} 返回注册的命令名称
 */
export function registerGenerateConfigCommand(context: vscode.ExtensionContext, config: GenerateCommand): string {
  const commandName = config.commandName;
  // 创建命令处理器
  const disposable = vscode.commands.registerCommand(commandName, (uri: Uri) => {
    generateConfig(uri, config); // 调用核心生成函数
  });
  // 注册命令到扩展上下文
  context.subscriptions.push(disposable);
  return commandName;
}

// 预定义的.clang-format文件生成配置
export const GenerateClangFormatCommand: GenerateCommand = {
  fileName: '.clang-format',
  commandName: 'vssm-tool.generateClangFormat',
  menuTitle: 'Generate .clang-format',
  templateName: 'ClangFormat',
  defaultTemplatePath: 'DefaultTemplate.clang-format'
};

// 预定义的工作区配置文件生成配置
export const GenerateWorkspaceConfigCommand: GenerateCommand = {
  fileName: '.code-workspace',
  fileNameGenerator: (uri: Uri) => {
    // 从路径中提取文件夹名作为工作区文件名
    const folderName = uri.path.split('/').filter(Boolean).pop() || 'workspace';
    return `${folderName}.code-workspace`; // 生成动态文件名
  },
  commandName: 'vssm-tool.generateWorkspaceConfig',
  menuTitle: 'Generate .code-workspace',
  templateName: 'WorkspaceConfig',
  defaultTemplatePath: 'DefaultTemplate.code-workspace'
};

// 预定义的.editorconfig文件生成配置
export const GenerateEditorConfigCommand: GenerateCommand = {
  fileName: '.editorconfig',
  commandName: 'vssm-tool.generateEditorConfig',
  menuTitle: 'Generate .editorconfig',
  templateName: 'EditorConfig',
  defaultTemplatePath: 'DefaultTemplate.editorconfig',
  generateAutoContent: async (uri: Uri) => {
    // 获取编辑器和工作区设置
    const editor = workspace.getConfiguration('editor', uri);
    const files = workspace.getConfiguration('files', uri);
    const ec = workspace.getConfiguration('generateEditorConfig');
    const generateAuto = !!ec.get<boolean>('generateAuto'); // 是否启用自动生成

    if (!generateAuto) {
      return Buffer.from(''); // 禁用自动生成时返回空内容
    }

    // 构建.editorconfig文件内容
    const settingsLines = [
      '# EditorConfig is awesome: https://EditorConfig.org',
      '',
      '# top-most EditorConfig file',
      'root = true',
      '',
      '[*]'
    ];

    /**
     * @brief 添加配置项到内容数组的辅助函数
     * @param {string} key - 配置键名
     * @param {string|number|boolean} [value] - 配置值
     */
    function addSetting(key: string, value?: string | number | boolean): void {
      if (value !== undefined) {
        settingsLines.push(`${key} = ${value}`);
      }
    }

    // 转换编辑器设置到EditorConfig格式
    const insertSpaces = !!editor.get<boolean>('insertSpaces');
    addSetting('indent_style', insertSpaces ? 'space' : 'tab'); // 缩进类型
    addSetting('indent_size', editor.get<number>('tabSize')); // 缩进大小

    // 行尾序列映射
    const eolMap = { '\r\n': 'crlf', '\n': 'lf' };
    let eolKey = files.get<string>('eol') || 'auto';
    if (eolKey === 'auto') {
      eolKey = require('os').EOL; // 自动检测系统默认行尾
    }
    addSetting('end_of_line', eolMap[eolKey as keyof typeof eolMap]); // 行尾格式

    // 字符编码映射
    const encodingMap = {
      iso88591: 'latin1',
      utf8: 'utf-8',
      utf8bom: 'utf-8-bom',
      utf16be: 'utf-16-be',
      utf16le: 'utf-16-le'
    };
    addSetting('charset', encodingMap[files.get<string>('encoding') as keyof typeof encodingMap]); // 文件编码

    // 修剪空格和插入换行设置
    addSetting('trim_trailing_whitespace', !!files.get<boolean>('trimTrailingWhitespace'));
    const insertFinalNewline = !!files.get<boolean>('insertFinalNewline');
    addSetting('insert_final_newline', insertFinalNewline);

    // 确保文件末尾有空行
    if (insertFinalNewline) {
      settingsLines.push('');
    }

    // 将内容数组转换为Buffer
    return Buffer.from(settingsLines.join(eolKey));
  }
};
