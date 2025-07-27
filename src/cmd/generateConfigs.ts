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
  defaultTemplatePath: 'DefaultTemplate.editorconfig'
};
