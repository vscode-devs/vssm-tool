import * as vscode from 'vscode';

/**
 * @brief 计算考虑tab的光标列位置（纯函数，便于单元测试）
 * @param lineText 光标所在行的文本
 * @param character 光标的原始字符偏移（0-based）
 * @param tabSize 制表符宽度
 * @returns 计算后的列位置(考虑tab)
 */
export function computeAdjustedColumn(lineText: string, character: number, tabSize: number): number {
  let column = 0;

  for (let i = 0; i < character; i++) {
    if (lineText.charAt(i) === '\t') {
      column += tabSize - (column % tabSize);
    } else {
      column++;
    }
  }

  return column;
}

/**
 * @brief 获取考虑tab的光标列位置
 * @param editor 文本编辑器实例
 * @param position 光标位置
 * @returns 计算后的列位置(考虑tab)
 */
function getAdjustedColumn(editor: vscode.TextEditor, position: vscode.Position): number {
  const line = editor.document.lineAt(position.line);
  const tabSize = (editor.options.tabSize as number) || 4;
  return computeAdjustedColumn(line.text, position.character, tabSize);
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
