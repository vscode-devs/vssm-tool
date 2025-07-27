/**
 * @file 命令视图模块，展示VSSM工具所有可用命令
 * @module views/commandsView
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * @brief 命令信息接口
 * @interface CommandInfo
 * @property {string} command - 命令ID
 * @property {string} title - 命令显示标题
 */
interface CommandInfo {
    command: string;
    title: string;
}

/**
 * @brief 命令树数据提供者类
 * @class CommandsTreeDataProvider
 * @implements {vscode.TreeDataProvider<CommandItem>}
 */
export class CommandsTreeDataProvider implements vscode.TreeDataProvider<CommandItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<CommandItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private commands: CommandItem[] = [];

    /**
     * @brief 构造函数，初始化时加载命令
     * @constructor
     */
    constructor() {
        this.loadCommandsFromPackageJson();
    }

    /**
     * @brief 从package.json加载命令配置
     * @private
     */
    private loadCommandsFromPackageJson() {
        try {
            // 获取package.json文件路径
            const packageJsonPath = path.join(__dirname, '../../package.json');
            // 读取并解析package.json文件内容
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            
            // 检查是否有contributes.commands配置
            if (packageJson.contributes?.commands) {
                // 将命令配置转换为CommandItem对象数组
                this.commands = packageJson.contributes.commands.map(
                    (cmd: CommandInfo) => 
                        new CommandItem(cmd.title, cmd.command)
                );
            }
        } catch (error) {
            // 捕获并记录加载错误
            console.error('Failed to load commands from package.json:', error);
        }
    }

    /**
     * @brief 获取树节点
     * @param {CommandItem} element - 命令项
     * @returns {vscode.TreeItem}
     */
    getTreeItem(element: CommandItem): vscode.TreeItem {
        // 直接返回命令项对应的TreeItem
        return element;
    }

    /**
     * @brief 获取子节点
     * @param {CommandItem} [element] - 父节点
     * @returns {Thenable<CommandItem[]>}
     */
    getChildren(element?: CommandItem): Thenable<CommandItem[]> {
        if (element) {
            // 如果是子节点请求，返回空数组
            return Promise.resolve([]);
        }
        // 返回所有命令项
        return Promise.resolve(this.commands);
    }

    /**
     * @brief 刷新命令树
     */
    refresh(): void {
        // 触发树视图更新
        this._onDidChangeTreeData.fire(undefined);
    }
}

/**
 * @brief 命令项类
 * @class CommandItem
 * @extends vscode.TreeItem
 */
class CommandItem extends vscode.TreeItem {
    /**
     * @brief 构造函数
     * @param {string} label - 显示标签
     * @param {string} commandId - 命令ID
     */
    constructor(
        public readonly label: string,
        public readonly commandId: string
    ) {
        // 初始化TreeItem
        super(label, vscode.TreeItemCollapsibleState.None);
        // 设置命令属性
        this.command = {
            command: commandId,
            title: label
        };
        // 设置上下文值
        this.contextValue = 'command';
        // 设置图标
        this.iconPath = new vscode.ThemeIcon('symbol-method');
    }
}

/**
 * @brief 注册命令视图
 * @param {vscode.ExtensionContext} context - 扩展上下文
 * @returns {string} 视图ID
 */
export function registerCommandsView(context: vscode.ExtensionContext): string {
    // 创建命令提供者实例
    const commandsProvider = new CommandsTreeDataProvider();
    // 注册树视图
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('vssm-tool-cmd', commandsProvider)
    );
    // 返回视图ID
    return 'vssm-tool-cmd';
}
