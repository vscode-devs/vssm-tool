import * as vscode from 'vscode';
import * as path from 'path';

/**
 * @class FixedDataNode
 * @brief 固定数据树节点类
 * @description 表示固定数据树中的节点，继承自vscode.TreeItem。
 * 用于显示预定义的固定数据，不依赖于外部文件或动态内容。
 */
export class FixedDataNode extends vscode.TreeItem {
  /**
   * @brief 构造函数
   * @param label 节点显示的标签
   * @param collapsibleState 节点的可折叠状态
   * @param children 子节点数组（可选）
   * @description 创建固定数据节点实例，设置节点的基本属性。
   * 如果有子节点且子节点数组非空，则节点可折叠。
   */
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly children?: FixedDataNode[]
  ) {
    super(label, collapsibleState);
    
    // 为有子节点的父节点设置category-style-01.svg图标
    if (children && children.length > 0) {
      this.iconPath = {
        light: vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'icon', 'light', 'category-style-01.svg')),
        dark: vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'icon', 'dark', 'category-style-01.svg'))
      };
    } else {
      this.iconPath = {
        light: vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'icon', 'light', 'category-style-02.svg')),
        dark: vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'icon', 'dark', 'category-style-02.svg'))
      };
    }
  }
}

/**
 * @class FixedDataProvider
 * @brief 固定数据提供者类
 * @description 实现VS Code的TreeDataProvider接口，提供固定的示例数据。
 * 用于演示如何创建显示静态内容的树视图，不依赖于外部文件系统或动态数据源。
 */
export class FixedDataProvider implements vscode.TreeDataProvider<FixedDataNode> {
  /**
   * @brief 事件发射器，用于通知树视图数据已更改
   * @description 当需要刷新树视图时，调用fire()方法触发此事件。
   */
  private _onDidChangeTreeData: vscode.EventEmitter<FixedDataNode | undefined | void> = new vscode.EventEmitter<FixedDataNode | undefined | void>();
  
  /**
   * @brief 树视图数据更改事件
   * @description VS Code通过此事件监听数据变化并更新UI。
   */
  readonly onDidChangeTreeData: vscode.Event<FixedDataNode | undefined | void> = this._onDidChangeTreeData.event;

  /**
   * @brief 刷新树视图
   * @description 触发onDidChangeTreeData事件，通知VS Code重新获取数据。
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
    console.log("The vssm-tool-fixed-data.refreshEntry command is executed!");
  }

  /**
   * @brief 获取树节点的显示项
   * @param element 树节点元素
   * @return 返回节点本身作为TreeItem
   * @description 返回传入的元素作为TreeItem显示。
   */
  getTreeItem(element: FixedDataNode): vscode.TreeItem {
    return element;
  }

  /**
   * @brief 获取子节点
   * @param element 父节点，如果为undefined则获取根节点
   * @return Promise<FixedDataNode[]> 返回子节点数组
   * @description 返回固定的示例数据。如果element为undefined，则返回顶级节点；
   * 如果element存在，则返回其预定义的子节点。
   */
  getChildren(element?: FixedDataNode): Thenable<FixedDataNode[]> {
    // 如果没有父节点，返回顶级节点
    if (!element) {
      return Promise.resolve([
        new FixedDataNode('Category 1', vscode.TreeItemCollapsibleState.Collapsed, [
          new FixedDataNode('Item 1.1', vscode.TreeItemCollapsibleState.None),
          new FixedDataNode('Item 1.2', vscode.TreeItemCollapsibleState.None)
        ]),
        new FixedDataNode('Category 2', vscode.TreeItemCollapsibleState.Collapsed, [
          new FixedDataNode('Item 2.1', vscode.TreeItemCollapsibleState.None),
          new FixedDataNode('Item 2.2', vscode.TreeItemCollapsibleState.None),
          new FixedDataNode('Item 2.3', vscode.TreeItemCollapsibleState.None)
        ]),
        new FixedDataNode('Simple Item', vscode.TreeItemCollapsibleState.None)
      ]);
    }
    
    // 如果有父节点，返回其子节点（如果有的话）
    return Promise.resolve(element.children || []);
  }
}

/**
 * @brief 注册固定数据视图
 * @param context 扩展上下文
 * @return 返回视图ID
 * @description 初始化并注册固定数据树视图。创建FixedDataProvider实例，
 * 注册树数据提供者，并返回视图ID。
 */
export function registerFixedDataView(context: vscode.ExtensionContext): string {
  // 创建固定数据提供者实例
  const fixedDataProvider = new FixedDataProvider();
  
  // 注册树数据提供者
  vscode.window.registerTreeDataProvider('vssm-tool-fixed-data', fixedDataProvider);
  
  // 注册刷新命令
  vscode.commands.registerCommand('vssm-tool-fixed-data.refreshEntry', () => fixedDataProvider.refresh());

  // 返回视图ID
  return 'vssm-tool-fixed-data';
}
