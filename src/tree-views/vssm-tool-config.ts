/**
 * @file 配置视图模块，展示VSSM工具所有配置项
 * @module views/configView
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * @brief 配置属性接口
 * @interface ConfigProperty
 * @property {string} key - 配置键
 * @property {string} type - 配置类型
 * @property {any} default - 默认值
 * @property {string} description - 配置描述
 */
interface ConfigProperty {
    key: string;
    type: string;
    default: any;
    description: string;
}

/**
 * @brief 配置树数据提供者类
 * @class ConfigTreeDataProvider
 * @implements {vscode.TreeDataProvider<ConfigItem>}
 */
export class ConfigTreeDataProvider implements vscode.TreeDataProvider<ConfigItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ConfigItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private configGroups: Map<string, ConfigProperty[]> = new Map();

    /**
     * @brief 构造函数，初始化时加载配置
     * @constructor
     */
    constructor() {
        this.loadConfigFromPackageJson();
    }

    /**
     * @brief 从package.json加载配置
     * @private
     */
    private loadConfigFromPackageJson() {
        try {
            // 获取package.json文件路径
            const packageJsonPath = path.join(__dirname, '../../package.json');
            // 读取并解析package.json文件内容
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            
            // 检查是否有contributes.configuration.properties配置
            if (packageJson.contributes?.configuration?.properties) {
                const properties = packageJson.contributes.configuration.properties;
                // 遍历所有配置属性
                Object.entries(properties).forEach(([key, value]) => {
                    const prop = value as any;
                    // 按前缀分组配置项
                    const group = key.split('.')[0];
                    
                    // 初始化分组数组
                    if (!this.configGroups.has(group)) {
                        this.configGroups.set(group, []);
                    }
                    // 添加配置项到分组
                    this.configGroups.get(group)?.push({
                        key,
                        type: prop.type,
                        default: prop.default,
                        description: prop.description
                    });
                });
            }
        } catch (error) {
            // 捕获并记录加载错误
            console.error('Failed to load config from package.json:', error);
        }
    }

    /**
     * @brief 获取树节点
     * @param {ConfigItem} element - 配置项
     * @returns {vscode.TreeItem}
     */
    getTreeItem(element: ConfigItem): vscode.TreeItem {
        // 直接返回配置项对应的TreeItem
        return element;
    }

    /**
     * @brief 获取子节点
     * @param {ConfigItem} [element] - 父节点
     * @returns {Thenable<ConfigItem[]>}
     */
    getChildren(element?: ConfigItem): Thenable<ConfigItem[]> {
        if (element) {
            // 返回分组下的配置项
            const groupProps = this.configGroups.get(element.label) || [];
            return Promise.resolve(groupProps.map(prop => 
                new ConfigItem(prop.key, prop.type, prop.default, prop.description)
            ));
        }
        // 返回所有配置分组
        return Promise.resolve(
            Array.from(this.configGroups.keys()).map(group => 
                new ConfigItem(group, 'group', '', '', true)
            )
        );
    }

    /**
     * @brief 刷新配置树
     */
    refresh(): void {
        // 触发树视图更新
        this._onDidChangeTreeData.fire(undefined);
    }
}

/**
 * @brief 配置项类
 * @class ConfigItem
 * @extends vscode.TreeItem
 */
class ConfigItem extends vscode.TreeItem {
    /**
     * @brief 构造函数
     * @param {string} label - 显示标签
     * @param {string} type - 配置类型
     * @param {any} defaultValue - 默认值
     * @param {string} description - 配置描述
     * @param {boolean} [isGroup=false] - 是否为分组项
     */
    constructor(
        public readonly label: string,
        public readonly type: string,
        public readonly defaultValue: any,
        public readonly description: string,
        public readonly isGroup: boolean = false
    ) {
        // 初始化TreeItem
        super(label, isGroup ? 
            vscode.TreeItemCollapsibleState.Collapsed : 
            vscode.TreeItemCollapsibleState.None
        );
        
        if (!isGroup) {
            // 设置工具提示信息
            this.tooltip = `${description}\nType: ${type}\nDefault: ${defaultValue}`;
            // 设置上下文值
            this.contextValue = 'config';
            // 设置图标
            this.iconPath = new vscode.ThemeIcon('settings-gear');
            // 设置点击命令
            this.command = {
                command: 'workbench.action.openSettings',
                title: 'Open Settings',
                arguments: [this.label]
            };
        } else {
            // 设置分组图标
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
}

/**
 * @brief 注册配置视图
 * @param {vscode.ExtensionContext} context - 扩展上下文
 * @returns {string} 视图ID
 */
export function registerConfigView(context: vscode.ExtensionContext): string {
    // 创建配置提供者实例
    const configProvider = new ConfigTreeDataProvider();
    // 注册树视图
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('vssm-tool-config', configProvider)
    );
    // 返回视图ID
    return 'vssm-tool-config';
}
