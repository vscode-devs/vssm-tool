/**
 * @file 命令视图模块，展示 VSSM 工具所有可用命令
 * @module views/commands
 * @details 原本是一个原生 TreeView（vssm-tool-cmd），其内容现已搬进 chat webview 渲染，
 *          故改为实现 SnapshottableProvider：供 webview 取快照，点击节点执行对应命令。
 */

import * as vscode from 'vscode';
import { registerSnapshottableProvider, type SnapNode, type SnapshottableProvider } from './registry';

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
 * @brief 清单命令声明读取器签名：返回 contributes.commands（无则空数组）
 * @details 由注册处基于 ExtensionContext 构造，provider 不感知清单的物理来源。
 */
export type CommandsReader = () => CommandInfo[];

/**
 * @class CommandsViewProvider
 * @brief 命令视图提供者，实现 SnapshottableProvider 供 chat webview 消费
 * @details 通过注入的读取器从扩展清单（package.json 的 contributes.commands）加载命令列表，
 *          快照为单层 SnapNode[]，点击节点即执行该命令。
 */
export class CommandsViewProvider implements SnapshottableProvider {
  /** @brief 对应原 view 的 id（webview 导航/快照路由用） */
  public readonly viewId = 'vssm-tool-cmd';

  /** @brief 注入的清单命令读取器 */
  private readonly _readCommands: CommandsReader;

  /** @brief 加载到的命令列表（纯数据） */
  private commands: CommandInfo[] = [];

  /**
   * @brief 构造函数，注入清单读取器并加载命令
   * @constructor
   * @param readCommands 清单命令声明读取器
   */
  constructor(readCommands: CommandsReader) {
    this._readCommands = readCommands;
    this.loadCommands();
  }

  /**
   * @brief 从注入的清单数据加载命令配置
   * @private
   */
  private loadCommands(): void {
    try {
      // 按 command id 去重，防止 package.json 里误重复声明导致同一命令显示多次
      const seen = new Set<string>();
      this.commands = this._readCommands()
        .filter((cmd) => {
          if (seen.has(cmd.command)) {
            return false;
          }
          seen.add(cmd.command);
          return true;
        })
        .map((cmd) => ({ command: cmd.command, title: cmd.title }));
    } catch (error) {
      // 捕获并记录加载错误
      console.error('Failed to load commands from extension manifest:', error);
    }
  }

  /**
   * @brief 刷新：重新从注入的读取器拉取命令声明
   * @details 供 webview 刷新按钮调用。
   */
  refresh(): void {
    this.loadCommands();
  }

  /**
   * @brief 返回完整树快照（SnapshottableProvider 契约）
   * @returns SnapNode[] 单层命令节点列表，可直接 postMessage 给 webview
   */
  getSnapshot(): SnapNode[] {
    return this.commands.map(
      (cmd): SnapNode => ({
        id: cmd.command,
        label: cmd.title,
        description: cmd.command,
        icon: 'cmd',
        collapsibleState: 'none',
        // 点击节点执行该命令
        command: { command: cmd.command }
      })
    );
  }
}

/**
 * @brief 注册命令视图到 webview 快照注册表
 * @param {vscode.ExtensionContext} context - 扩展上下文（用于读取扩展清单）
 * @returns {string} viewId（供 extension.ts 去重注册使用）
 * @details 注意：不再注册原生 TreeView（其内容已搬进 webview）。
 *          清单数据经 context.extension.packageJSON 注入，provider 不感知物理路径。
 */
export function registerCommandsView(context: vscode.ExtensionContext): string {
  const readCommands = (): CommandInfo[] => context.extension.packageJSON?.contributes?.commands ?? [];
  registerSnapshottableProvider(new CommandsViewProvider(readCommands));
  return 'vssm-tool-cmd';
}
