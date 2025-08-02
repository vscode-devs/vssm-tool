import * as vscode from 'vscode';

/**
 * @brief 创建并导出一个VS Code输出通道，用于扩展的日志记录。
 * @description 这个输出通道可以被扩展的其他模块导入和使用，
 * 以便将日志信息统一输出到“VSSM-Tool”面板。
 */
export const outputChannel = vscode.window.createOutputChannel('VSSM-Tool');

/**
 * @brief 生成格式化的日志前缀，包含时间戳和文件信息。
 * @private
 * @returns 格式化后的日志前缀字符串，例如 "[2025-08-02 10:50:22][extension.ts:25]"
 */
function _getFormattedLogPrefix(): string {
	const now = new Date();
	// Format date to China local time: YYYY-MM-DD HH:mm:ss
	const timestamp = now.toLocaleString('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	}).replace(/\//g, '-');
	
	const stack = new Error().stack || '';
	const stackLines = stack.split('\n');
	// Stack trace depth:
	// Index 0: `Error`
	// Index 1: `at _getFormattedLogPrefix (src/helpers/utils.ts:XX:XX)`
	// Index 2: `at logToVssmToolChannel (src/helpers/utils.ts:XX:XX)` (or logError...)
	// Index 3: `at <original_caller> (src/original/file.ts:XX:XX)`
	const originalCallerLine = stackLines[3] || ''; 
	
	// Regex to extract file name and line number from "    at ... (file_path:line:col)"
	const match = originalCallerLine.match(/\((.*):(\d+):\d+\)/);
	let fileInfo = 'unknown_file:0';
	if (match && match[1] && match[2]) {
		// Extract only the filename, removing any directory paths
		const fileName = match[1].split('/').pop()?.split('\\').pop() || 'unknown_file';
		fileInfo = `${fileName}:${match[2]}`;
	}
	
	return `[${timestamp}][${fileInfo}]`;
}

/**
 * @brief 将消息记录到VSSM-Tool输出通道。
 * @param message 要记录的消息字符串。
 */
export function logToVssmToolChannel(message: string): void {
	const prefix = _getFormattedLogPrefix();
	const formattedMessage = `${prefix} ${message}`;
	outputChannel.appendLine(formattedMessage);
}

/**
 * @brief 将错误消息记录到VSSM-Tool输出通道。
 * @param message 要记录的错误消息字符串。
 */
export function logErrorToVssmToolChannel(message: string): void {
	const prefix = _getFormattedLogPrefix();
	const errorPrefix = '[ERROR]';
	
	const formattedMessage = `${prefix} ${errorPrefix} ${message}`;
	outputChannel.appendLine(formattedMessage);
}

/**
 * @brief 显示VSSM-Tool输出通道。
 */
export function showVssmToolChannel(): void {
	outputChannel.show();
}
