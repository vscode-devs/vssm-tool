import * as vscode from 'vscode';

/**
 * @brief 注册HelloWorld命令
 * @param context VS Code扩展上下文对象
 * @details 注册'vssm-tool.helloWorld'命令并添加到扩展订阅中
 * @returns 返回注册的命令名称
 */
export function registerHelloWorldCommand(context: vscode.ExtensionContext): string {
    const commandName = 'vssm-tool.helloWorld';
    // 注册'vssm-tool.helloWorld'命令
    const disposable = vscode.commands.registerCommand(commandName, () => {
        // 当命令执行时显示信息提示框
        vscode.window.showInformationMessage('Hello World from vssm-tool!');
    });
    
    // 将命令注册到扩展上下文，确保扩展停用时能正确清理
    context.subscriptions.push(disposable);
    return commandName;
}
