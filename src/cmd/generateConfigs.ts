import * as vscode from 'vscode';
import { Uri, window, workspace } from 'vscode';
import { readFile as _readFile } from 'fs';
import { resolve } from 'path';
import { promisify } from 'util';

const readFile = promisify(_readFile);

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
 * @brief 生成配置文件
 * @param uri 目标文件夹的URI
 * @param config GenerateCommand配置
 */
async function generateConfig(uri: Uri, config: GenerateCommand) {
  const workspaceUri = workspace.workspaceFolders?.[0].uri;
  const currentUri = uri || workspaceUri;

  if (!currentUri) {
    window.showErrorMessage("Workspace doesn't contain any folders.");
    return;
  }

  const fileName = config.fileNameGenerator ? config.fileNameGenerator(currentUri) : config.fileName;
  const configUri = Uri.parse(`${currentUri.toString()}/${fileName}`);

  try {
    const stats = await workspace.fs.stat(configUri);
    if (stats.type === vscode.FileType.File) {
      window.showErrorMessage(`A ${fileName} file already exists in this workspace.`);
      return;
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'EntryNotFound (FileSystemError)') {
      await writeFile();
    } else {
      window.showErrorMessage(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  async function writeFile() {
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

    const wc = workspace.getConfiguration(`generate${config.templateName}`);
    const customTemplatePath = wc.get<string>('customTemplatePath');
    const template = wc.get<string>('template') || 'default';
    const defaultTemplatePath = resolve(__dirname, '..', config.defaultTemplatePath);

    let templateBuffer: Buffer;
    try {
      let templatePath = defaultTemplatePath;
      if (customTemplatePath) {
        try {
          await readFile(customTemplatePath);
          templatePath = customTemplatePath;
        } catch {
          templatePath = /^default$/i.test(template) ? defaultTemplatePath : template;
        }
      } else {
        templatePath = /^default$/i.test(template) ? defaultTemplatePath : template;
      }
      templateBuffer = await readFile(templatePath);
    } catch (error) {
      window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }

    try {
      await workspace.fs.writeFile(configUri, templateBuffer);
    } catch (error) {
      window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * @brief 注册生成配置文件的命令
 * @param context VS Code扩展上下文
 * @param config GenerateCommand配置
 * @returns 返回注册的命令名称
 */
export function registerGenerateConfigCommand(context: vscode.ExtensionContext, config: GenerateCommand): string {
  const commandName = config.commandName;
  const disposable = vscode.commands.registerCommand(commandName, (uri: Uri) => {
    generateConfig(uri, config);
  });
  context.subscriptions.push(disposable);
  return commandName;
}

// 预定义的生成命令配置
export const GenerateClangFormatCommand: GenerateCommand = {
  fileName: '.clang-format',
  commandName: 'vssm-tool.generateClangFormat',
  menuTitle: 'Generate .clang-format',
  templateName: 'ClangFormat',
  defaultTemplatePath: 'DefaultTemplate.clang-format'
};

export const GenerateWorkspaceConfigCommand: GenerateCommand = {
  fileName: '.code-workspace',
  fileNameGenerator: (uri: Uri) => {
    const folderName = uri.path.split('/').filter(Boolean).pop() || 'workspace';
    return `${folderName}.code-workspace`;
  },
  commandName: 'vssm-tool.generateWorkspaceConfig',
  menuTitle: 'Generate .code-workspace',
  templateName: 'WorkspaceConfig', 
  defaultTemplatePath: 'DefaultTemplate.code-workspace'
};

export const GenerateEditorConfigCommand: GenerateCommand = {
  fileName: '.editorconfig',
  commandName: 'vssm-tool.generateEditorConfig',
  menuTitle: 'Generate .editorconfig',
  templateName: 'EditorConfig',
  defaultTemplatePath: 'DefaultTemplate.editorconfig',
  generateAutoContent: async (uri: Uri) => {
    const editor = workspace.getConfiguration('editor', uri);
    const files = workspace.getConfiguration('files', uri);
    const ec = workspace.getConfiguration('generateEditorConfig');
    const generateAuto = !!ec.get<boolean>('generateAuto');

    if (!generateAuto) {
      return Buffer.from('');
    }

    const settingsLines = ['# EditorConfig is awesome: https://EditorConfig.org', '', 
                         '# top-most EditorConfig file', 'root = true', '', '[*]'];

    function addSetting(key: string, value?: string | number | boolean): void {
      if (value !== undefined) {
        settingsLines.push(`${key} = ${value}`);
      }
    }

    const insertSpaces = !!editor.get<boolean>('insertSpaces');
    addSetting('indent_style', insertSpaces ? 'space' : 'tab');
    addSetting('indent_size', editor.get<number>('tabSize'));

    const eolMap = {'\r\n': 'crlf', '\n': 'lf'};
    let eolKey = files.get<string>('eol') || 'auto';
    if (eolKey === 'auto') {
      eolKey = require('os').EOL;
    }
    addSetting('end_of_line', eolMap[eolKey as keyof typeof eolMap]);

    const encodingMap = {
      iso88591: 'latin1',
      utf8: 'utf-8',
      utf8bom: 'utf-8-bom',
      utf16be: 'utf-16-be',
      utf16le: 'utf-16-le'
    };
    addSetting('charset', encodingMap[files.get<string>('encoding') as keyof typeof encodingMap]);

    addSetting('trim_trailing_whitespace', !!files.get<boolean>('trimTrailingWhitespace'));

    const insertFinalNewline = !!files.get<boolean>('insertFinalNewline');
    addSetting('insert_final_newline', insertFinalNewline);

    if (insertFinalNewline) {
      settingsLines.push('');
    }

    return Buffer.from(settingsLines.join(eolKey));
  }
};
