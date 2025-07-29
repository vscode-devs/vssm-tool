import * as vscode from 'vscode';

/**
 * @brief 获取考虑tab的光标列位置
 * @param editor 文本编辑器实例
 * @param position 光标位置
 * @returns 计算后的列位置(考虑tab)
 */
function getAdjustedColumn(editor: vscode.TextEditor, position: vscode.Position): number {
  const line = editor.document.lineAt(position.line);
  let column = 0;

  for (let i = 0; i < position.character; i++) {
    if (line.text.charAt(i) === '\t') {
      const tabSize = (editor.options.tabSize as number) || 4;
      column += tabSize - (column % tabSize);
    } else {
      column++;
    }
  }

  return column;
}

/**
 * @brief 处理获取光标位置命令
 */
function handleGetCursorPosition() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('没有活动的文本编辑器');
    return;
  }

  const position = editor.selection.active;
  const adjustedColumn = getAdjustedColumn(editor, position);

  vscode.window.showInformationMessage(
    `行: ${position.line + 1}, 列: ${adjustedColumn + 1} (原始列: ${position.character + 1})`
  );
}

/**
 * @brief 注册获取光标位置命令
 * @param context VS Code扩展上下文对象
 * @returns 返回注册的命令名称
 */
export function registerCursorPositionCommand(context: vscode.ExtensionContext): string {
  const commandName = 'vssm-tool.getCursorPosition';
  const disposable = vscode.commands.registerCommand(commandName, handleGetCursorPosition);
  context.subscriptions.push(disposable);
  return commandName;
}
