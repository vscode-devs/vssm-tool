/**
 * @file 配置视图模块，展示 VSSM 工具所有配置项
 * @module views/config
 * @details 原本是一个原生 TreeView（vssm-tool-config），其内容现已搬进 chat webview 渲染，
 *          故改为实现 SnapshottableProvider：供 webview 取快照，点击配置项打开 VS Code 设置。
 */

import * as vscode from 'vscode';
import { registerSnapshottableProvider, type SnapNode, type SnapshottableProvider } from './registry';

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
 * @brief 清单数据读取器签名：返回 contributes.configuration.properties（无则空对象）
 * @details 由注册处基于 ExtensionContext 构造，provider 不感知清单的物理来源。
 */
export type ConfigurationPropertiesReader = () => Record<string, unknown>;

/**
 * @class ConfigViewProvider
 * @brief 配置视图提供者，实现 SnapshottableProvider 供 chat webview 消费
 * @details 通过注入的读取器从扩展清单（package.json 的 contributes.configuration.properties）
 *          按前缀分组配置项，快照为两层 SnapNode[]，点击叶子节点按 key 打开 VS Code 设置。
 */
export class ConfigViewProvider implements SnapshottableProvider {
  /** @brief 对应原 view 的 id（webview 导航/快照路由用） */
  public readonly viewId = 'vssm-tool-config';

  /** @brief 注入的清单配置属性读取器 */
  private readonly _readProperties: ConfigurationPropertiesReader;

  /** @brief 配置分组：前缀 → 配置项列表 */
  private configGroups: Map<string, ConfigProperty[]> = new Map();

  /**
   * @brief 构造函数，注入清单读取器并加载配置
   * @constructor
   * @param readProperties 清单配置属性读取器
   */
  constructor(readProperties: ConfigurationPropertiesReader) {
    this._readProperties = readProperties;
    this.loadConfig();
  }

  /**
   * @brief 按前缀分组配置属性
   * @private
   */
  private loadConfig(): void {
    try {
      // 清空旧分组，避免重复刷新时累加
      this.configGroups.clear();
      const properties = this._readProperties();
      // 遍历所有配置属性，按前缀分组
      Object.entries(properties).forEach(([key, value]) => {
        const prop = value as any;
        const group = key.split('.')[0];

        if (!this.configGroups.has(group)) {
          this.configGroups.set(group, []);
        }
        this.configGroups.get(group)?.push({
          key,
          type: prop.type,
          default: prop.default,
          description: prop.description
        });
      });
    } catch (error) {
      // 捕获并记录加载错误
      console.error('Failed to load config from extension manifest:', error);
    }
  }

  /**
   * @brief 刷新：重新从注入的读取器拉取配置并分组
   * @details 供 webview 刷新按钮调用。
   */
  refresh(): void {
    this.loadConfig();
  }

  /**
   * @brief 返回完整树快照（SnapshottableProvider 契约）
   * @returns SnapNode[] 两层分组树，可直接 postMessage 给 webview
   */
  getSnapshot(): SnapNode[] {
    return Array.from(this.configGroups.entries()).map(
      ([group, props]): SnapNode => ({
        id: group,
        label: group,
        icon: 'folder',
        // 分组默认展开，便于直接看到下属配置项
        collapsibleState: 'expanded',
        children: props.map(
          (prop): SnapNode => ({
            id: prop.key,
            label: prop.key,
            description: `${prop.type} = ${prop.default}`,
            icon: 'settings',
            collapsibleState: 'none',
            // 点击节点按配置 key 打开 VS Code 设置
            command: { command: 'workbench.action.openSettings', args: [prop.key] }
          })
        )
      })
    );
  }
}

/**
 * @brief 注册配置视图到 webview 快照注册表
 * @param {vscode.ExtensionContext} context - 扩展上下文（用于读取扩展清单）
 * @returns {string} viewId（供 extension.ts 去重注册使用）
 * @details 注意：不再注册原生 TreeView（其内容已搬进 webview）。
 *          清单数据经 context.extension.packageJSON 注入，provider 不感知物理路径。
 */
export function registerConfigView(context: vscode.ExtensionContext): string {
  const readProperties = () => context.extension.packageJSON?.contributes?.configuration?.properties ?? {};
  registerSnapshottableProvider(new ConfigViewProvider(readProperties));
  return 'vssm-tool-config';
}
