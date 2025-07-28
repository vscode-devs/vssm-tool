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
    
    // 为有子节点的父节点设置tag-style-01.svg图标
    if (children && children.length > 0) {
      this.iconPath = {
        light: vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'icon', 'light', 'tag-style-01.svg')),
        dark: vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'icon', 'dark', 'tag-style-01.svg'))
      };
      // 为父节点设置悬停提示
      this.tooltip = `tag: ${this.label}`;
    } else {
      this.iconPath = {
        light: vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'icon', 'light', 'tag-style-02.svg')),
        dark: vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'icon', 'dark', 'tag-style-02.svg'))
      };
      // 为子节点设置悬停提示
      this.tooltip = `Item: ${this.label}`;
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
  // 存储树的根节点数据
  private data: FixedDataNode[] = [];

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
   * @brief 格式化日期时间为yyyy-mm-dd HH:MM:SS格式
   * @param date Date对象
   * @return 格式化后的字符串
   */
  private formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * @brief 添加新项
   * @param element 当前选中的树节点元素，如果为undefined则添加到根节点
   * @description 创建一个新项并添加到指定父节点或根节点，然后刷新视图
   */
  addNewItem(element?: FixedDataNode): void {
    // 确定父节点标签
    const parentLabel = element?.label;
    
    // 生成新项目的唯一标签
    const timestamp = this.formatDateTime(new Date());
    const newItemLabel = parentLabel ? 
      `${parentLabel}-item-${timestamp}` : 
      `Item-${timestamp}`;
    
    // 创建新节点
    const newItem = new FixedDataNode(newItemLabel, vscode.TreeItemCollapsibleState.None);
    
    if (parentLabel) {
      // 查找父节点并添加子节点
      const parent = this.findNodeByLabel(this.data, parentLabel);
      if (parent) {
        // 确保parent.children存在，如果不存在则初始化为空数组
        const children = parent.children || [];
        // 由于FixedDataNode的属性是只读的，需要创建一个新的父节点
        const updatedParent = new FixedDataNode(
          parent.label,
          vscode.TreeItemCollapsibleState.Collapsed,
          [...children, newItem]
        );
        
        // 在数据中替换原来的父节点
        this.replaceNode(this.data, parent.label, updatedParent);
      }
    } else {
      // 添加到根节点
      this.data.push(newItem);
    }
    
    // 刷新视图
    this.refresh();
  }

  /**
   * @brief 在节点数组中替换指定标签的节点
   * @param nodes 节点数组
   * @param label 要替换的节点标签
   * @param newNode 新的节点
   * @return 是否成功替换
   */
  private replaceNode(nodes: FixedDataNode[], label: string, newNode: FixedDataNode): boolean {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].label === label) {
        nodes[i] = newNode;
        return true;
      }
      if (nodes[i].children) {
        // 确保children存在，如果不存在则初始化为空数组
        const children = nodes[i].children || [];
        if (this.replaceNode(children, label, newNode)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * @brief 在节点数组中删除指定标签的节点
   * @param nodes 节点数组
   * @param label 要删除的节点标签
   * @return 是否成功删除
   */
  private deleteNode(nodes: FixedDataNode[], label: string): boolean {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].label === label) {
        nodes.splice(i, 1);
        return true;
      }
      if (nodes[i].children) {
        // 确保children存在，如果不存在则初始化为空数组
        const children = nodes[i].children || [];
        if (this.deleteNode(children, label)) {
          // 如果删除了子节点且父节点不再有子节点，更新父节点状态
          if (children.length === 0) {
            const updatedParent = new FixedDataNode(
              nodes[i].label,
              vscode.TreeItemCollapsibleState.None,
              []
            );
            this.replaceNode(this.data, nodes[i].label, updatedParent);
          }
          return true;
        }
      }
    }
    return false;
  }

  /**
   * @brief 根据标签查找节点
   * @param nodes 节点数组
   * @param label 要查找的标签
   * @return 找到的节点，如果未找到则返回undefined
   */
  private findNodeByLabel(nodes: FixedDataNode[], label: string): FixedDataNode | undefined {
    for (const node of nodes) {
      if (node.label === label) {
        return node;
      }
      if (node.children) {
        const found = this.findNodeByLabel(node.children, label);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }

  /**
   * @brief 获取所有节点的标签
   * @param nodes 节点数组
   * @return 包含所有节点标签的数组
   */
  private getAllNodeLabels(nodes: FixedDataNode[]): string[] {
    const labels: string[] = [];
    for (const node of nodes) {
      labels.push(node.label);
      if (node.children) {
        labels.push(...this.getAllNodeLabels(node.children));
      }
    }
    return labels;
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
   * @description 返回存储在this.data中的数据。如果element为undefined，则返回根节点数据；
   * 如果element存在，则返回其子节点。
   */
  getChildren(element?: FixedDataNode): Thenable<FixedDataNode[]> {
    // 如果没有父节点，返回根节点数据
    if (!element) {
      // 初始化数据（如果还没有）
      if (this.data.length === 0) {
        this.data = [
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
        ];
      }
      return Promise.resolve(this.data);
    }
    
    // 如果有父节点，返回其子节点（如果有的话）
    return Promise.resolve(element.children || []);
  }

  /**
   * @brief 删除指定节点
   * @param element 要删除的树节点元素
   * @description 从树中删除指定节点，然后刷新视图
   */
  deleteItem(element?: FixedDataNode): void {
    if (!element) {
      return; // 没有选中节点
    }
    
    // 删除节点
    if (this.deleteNode(this.data, element.label)) {
      // 刷新视图
      this.refresh();
    }
  }

  /**
   * @brief 编辑指定节点
   * @param element 要编辑的树节点元素
   * @description 修改指定节点的标签，然后刷新视图
   */
  async editItem(element?: FixedDataNode): Promise<void> {
    if (!element) {
      return; // 没有选中节点
    }
    
    // 显示输入框获取新标签
    const newLabel = await vscode.window.showInputBox({
      prompt: 'Enter new label for the item',
      value: element.label,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Label cannot be empty';
        }
        return null;
      }
    });
    
    // 如果用户取消输入或输入为空，不进行修改
    if (!newLabel || newLabel.trim().length === 0) {
      return;
    }
    
    // 创建新节点，保持其他属性不变
    const updatedNode = new FixedDataNode(
      newLabel,
      element.collapsibleState,
      element.children
    );
    
    // 替换节点
    if (this.replaceNode(this.data, element.label, updatedNode)) {
      // 刷新视图
      this.refresh();
    }
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
  
  // 注册添加命令，确保传递选中的节点作为参数
  vscode.commands.registerCommand('vssm-tool-fixed-data.addEntry', (node: FixedDataNode) => fixedDataProvider.addNewItem(node));
  
  // 注册删除命令，确保传递选中的节点作为参数
  vscode.commands.registerCommand('vssm-tool-fixed-data.deleteEntry', (node: FixedDataNode) => fixedDataProvider.deleteItem(node));
  
  // 注册编辑命令，确保传递选中的节点作为参数
  vscode.commands.registerCommand('vssm-tool-fixed-data.editEntry', (node: FixedDataNode) => fixedDataProvider.editItem(node));

  // 返回视图ID
  return 'vssm-tool-fixed-data';
}
