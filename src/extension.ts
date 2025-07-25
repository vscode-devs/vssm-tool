// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { registerHelloWorldCommand } from './cmd/helloworld';
import { registerCursorPositionCommand } from './cmd/cursor-position';
import { registerGenerateEditorConfigCommand } from './cmd/generateEditorConfig';
import { registerGenerateWorkspaceConfigCommand } from './cmd/generateWorkspaceConfig';
import { registerGenerateClangFormatCommand } from './cmd/generateClangFormat';
import { registerNpmRunTaskCommand } from './cmd/npm-run-task';
// import { registerMarkdownHoverProvider } from './language-features/markdownHover';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "vssm-tool" is now active!');

  // Register commands
  registerHelloWorldCommand(context);
  registerCursorPositionCommand(context);
  registerGenerateEditorConfigCommand(context);
  registerGenerateWorkspaceConfigCommand(context);
  registerGenerateClangFormatCommand(context);
  registerNpmRunTaskCommand(context);
  // registerMarkdownHoverProvider(context); // 这里不注册，暂不使用这个功能
}

// This method is called when your extension is deactivated
export function deactivate() { }
