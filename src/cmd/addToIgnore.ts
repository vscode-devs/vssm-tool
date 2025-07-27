import * as vscode from 'vscode';
import { Uri, window, workspace } from 'vscode';
import { join } from 'path';

interface IgnoreCommand {
    fileName: string;
    commandName: string;
    menuTitle: string;
}

/**
 * @brief 将文件/目录添加到忽略文件
 * @param uri 目标文件/目录的URI
 * @param ignoreFileName 忽略文件名
 */
async function addToIgnore(uri: Uri, ignoreFileName: string) {
    // 获取工作区根目录
    const workspaceRoot = workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceRoot) {
        window.showErrorMessage('No workspace folder found');
        return;
    }

    // 获取忽略文件路径
    const ignorePath = join(workspaceRoot, ignoreFileName);
    const ignoreUri = Uri.file(ignorePath);

    // 获取相对路径
    const relativePath = workspace.asRelativePath(uri, false);

    try {
        // 检查忽略文件是否存在
        let content = '';
        try {
            const data = await workspace.fs.readFile(ignoreUri);
            content = data.toString();
        } catch (err) {
            // 文件不存在，创建空内容
            content = '';
        }

        // 检查是否已存在
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.includes(relativePath)) {
            window.showInformationMessage(`"${relativePath}" already exists in ${ignoreFileName}`);
            return;
        }

        // 追加新行
        const newContent = content + (content.endsWith('\n') || content === '' ? '' : '\n') + relativePath + '\n';

        // 写入文件
        await workspace.fs.writeFile(ignoreUri, Buffer.from(newContent));
        window.showInformationMessage(`Added "${relativePath}" to ${ignoreFileName}`);
    } catch (err) {
        window.showErrorMessage(`Failed to update ${ignoreFileName}: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/**
 * @brief 注册添加到忽略文件命令
 * @param context VS Code扩展上下文
 * @param config IgnoreCommand配置
 * @returns 返回注册的命令名称
 */
export function registerAddToIgnoreCommand(
    context: vscode.ExtensionContext,
    config: IgnoreCommand
): string {
    const commandName = config.commandName;
    const disposable = vscode.commands.registerCommand(commandName, (uri: Uri) => {
        addToIgnore(uri, config.fileName);
    });
    context.subscriptions.push(disposable);
    return commandName;
}

// 预定义的忽略命令配置
export const AddToPrettierIgnoreCommand: IgnoreCommand = {
    fileName: '.prettierignore',
    commandName: 'vssm-tool.addToPrettierIgnore',
    menuTitle: 'Add to .prettierignore'
};

export const AddToGitIgnoreCommand: IgnoreCommand = {
    fileName: '.gitignore',
    commandName: 'vssm-tool.addToGitIgnore',
    menuTitle: 'Add to .gitignore'
};

export const AddToVScodeIgnoreCommand: IgnoreCommand = {
    fileName: '.vscodeignore',
    commandName: 'vssm-tool.addToVScodeIgnore',
    menuTitle: 'Add to .vscodeignore'
};
