import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import { logToVssmToolChannel, logErrorToVssmToolChannel } from '../helpers/utils';

/** 自建终端的名称标识 */
const TERMINAL_NAME = 'Claude Code';

/**
 * @brief 格式化选区代码为带行号的文本
 * @param text 原始代码文本
 * @param startLine 起始行号(1-based)
 * @returns 带行号前缀的格式化文本
 */
function formatCodeWithLineNumbers(text: string, startLine: number): string {
  const lines = text.split('\n');
  const maxLineNum = startLine + lines.length - 1;
  const width = String(maxLineNum).length;

  return lines
    .map((line, i) => {
      const num = String(startLine + i).padStart(width, ' ');
      return `${num} | ${line}`;
    })
    .join('\n');
}

/**
 * @brief 构建发送给 Claude Code 的 prompt 文本
 * @param filePath 相对文件路径
 * @param startLine 起始行号(1-based)
 * @param endLine 结束行号(1-based)
 * @param languageId 语言标识
 * @param selectedText 选中的代码文本
 * @returns 格式化后的完整 prompt
 */
function buildPrompt(
  filePath: string,
  startLine: number,
  endLine: number,
  languageId: string,
  selectedText: string
): string {
  const lineCount = endLine - startLine + 1;
  const header = `${filePath} L${startLine}-${endLine} (${lineCount} \u884c, ${languageId})`;
  const codeBlock = formatCodeWithLineNumbers(selectedText, startLine);

  return `${header}\n\n\`\`\`${languageId}\n${codeBlock}\n\`\`\``;
}

/**
 * @brief 检查 claude CLI 是否可用
 * @returns claude 可用返回 true
 */
function isClaudeCliAvailable(): boolean {
  try {
    cp.execSync('which claude 2>/dev/null || where claude 2>nul', { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

/**
 * @brief 查找正在运行 claude CLI 的终端
 * @details 检测策略：
 *   1. 优先查找自建终端（名称包含 "Claude Code"）
 *   2. 遍历所有终端，通过 terminal.processId 获取 shell PID，
 *      再用 ps 构建进程树，检查 claude 是否为某个终端 shell 的后代进程
 * @returns 匹配的终端实例，未找到返回 undefined
 */
async function findClaudeTerminal(): Promise<vscode.Terminal | undefined> {
  // 优先检查自建终端
  const named = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
  if (named) {
    return named;
  }

  // 收集所有终端的 shell PID
  const pidToTerminal = new Map<number, vscode.Terminal>();
  const shellPids = new Set<number>();
  for (const t of vscode.window.terminals) {
    try {
      const pid = await t.processId;
      if (pid) {
        pidToTerminal.set(pid, t);
        shellPids.add(pid);
      }
    } catch {
      continue;
    }
  }

  if (shellPids.size === 0) {
    return undefined;
  }

  // 通过 ps 读取进程树，查找 claude 进程并向上追溯是否属于某个终端
  try {
    const psOutput = cp.execSync('ps -eo pid,ppid,comm', { encoding: 'utf-8', timeout: 3000 });
    const ppidOf = new Map<number, number>();
    const commOf = new Map<number, string>();

    for (const line of psOutput.trim().split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const pid = parseInt(parts[0]);
        const ppid = parseInt(parts[1]);
        const comm = parts.slice(2).join(' ');
        ppidOf.set(pid, ppid);
        commOf.set(pid, comm);
      }
    }

    // 对每个 claude 进程，沿 ppid 链向上查找是否属于某个终端
    for (const [pid, comm] of commOf) {
      if (!comm.includes('claude')) {
        continue;
      }
      let cur = ppidOf.get(pid);
      const visited = new Set<number>();
      while (cur && !visited.has(cur)) {
        if (shellPids.has(cur)) {
          logToVssmToolChannel(`Found claude (PID ${pid}) in terminal "${pidToTerminal.get(cur)!.name}"`);
          return pidToTerminal.get(cur);
        }
        visited.add(cur);
        cur = ppidOf.get(cur);
      }
    }
  } catch {
    // ps 不可用（Windows 等），跳过进程树检测
  }

  return undefined;
}

/**
 * @brief 将文本粘贴到 Claude Code CLI 终端
 * @details 写入剪贴板后调用 VS Code 内置 paste 命令，确保多行文本正确输入。
 *          若没有 Claude Code 终端则新建并启动 claude。
 * @param prompt 要输入的文本
 */
async function sendToClaudeTerminal(prompt: string): Promise<void> {
  await vscode.env.clipboard.writeText(prompt);

  const terminal = await findClaudeTerminal();

  if (!terminal) {
    const newTerminal = vscode.window.createTerminal(TERMINAL_NAME);
    newTerminal.show(true);
    newTerminal.sendText('claude');

    logToVssmToolChannel('Claude Code CLI starting, content copied to clipboard');
    vscode.window.showInformationMessage(
      'Claude Code CLI \u542f\u52a8\u4e2d\uff0c\u5185\u5bb9\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f\uff0c\u8bf7\u5728 claude \u5c31\u7eea\u540e\u7c98\u8d34 (Ctrl+V)'
    );
    return;
  }

  // 已有 claude 终端：聚焦后粘贴
  terminal.show(true);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await vscode.commands.executeCommand('workbench.action.terminal.paste');
}

/**
 * @brief 命令处理函数 - 捕获当前选区并发送到 Claude Code CLI
 */
async function handleSendToClaudeCode(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('\u6ca1\u6709\u6d3b\u52a8\u7684\u7f16\u8f91\u5668');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage('\u8bf7\u5148\u5728\u7f16\u8f91\u5668\u4e2d\u9009\u4e2d\u4ee3\u7801');
    return;
  }

  // 检查 claude CLI 是否可用
  if (!isClaudeCliAvailable()) {
    const install = await vscode.window.showWarningMessage(
      '\u672a\u68c0\u6d4b\u5230 claude CLI\uff0c\u8bf7\u5148\u5b89\u88c5 Claude Code CLI',
      '\u67e5\u770b\u5b89\u88c5\u6307\u5357',
      '\u53d6\u6d88'
    );
    if (install === '\u67e5\u770b\u5b89\u88c5\u6307\u5357') {
      vscode.env.openExternal(vscode.Uri.parse('https://docs.anthropic.com/en/docs/claude-code'));
    }
    return;
  }

  const document = editor.document;
  const startLine = selection.start.line + 1;
  const endLine = selection.end.line + 1;
  const selectedText = document.getText(selection);

  // 计算相对路径
  const workspaceFolders = vscode.workspace.workspaceFolders;
  let filePath = document.uri.fsPath;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    if (filePath.startsWith(workspaceRoot)) {
      filePath = path.relative(workspaceRoot, filePath);
    }
  }

  const languageId = document.languageId;
  const prompt = buildPrompt(filePath, startLine, endLine, languageId, selectedText);

  logToVssmToolChannel(`Sending selection to Claude Code CLI: ${filePath} L${startLine}-${endLine}`);

  try {
    await sendToClaudeTerminal(prompt);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logErrorToVssmToolChannel(`Failed to send to Claude Code CLI: ${msg}`);
    vscode.window.showErrorMessage(`\u53d1\u9001\u5230 Claude Code \u5931\u8d25: ${msg}`);
  }
}

/**
 * @brief 注册发送选区到 Claude Code CLI 的命令
 * @param context VS Code 扩展上下文对象
 * @returns 返回注册的命令名称
 */
export function registerSendToClaudeCodeCommand(context: vscode.ExtensionContext): string {
  const commandName = 'vssm-tool.sendToClaudeCode';

  const disposable = vscode.commands.registerCommand(commandName, handleSendToClaudeCode);
  context.subscriptions.push(disposable);

  return commandName;
}
