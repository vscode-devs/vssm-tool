import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {logToVssmToolChannel } from '../helpers/utils'
/**
 * @class TemplateNode
 * @brief 模板文件树节点类
 * @description 表示模板文件树中的节点，继承自vscode.TreeItem。
 * 用于显示扫描到的DefaultTemplate开头的模板文件。
 */
export class TemplateNode extends vscode.TreeItem {
  /**
   * @brief 构造函数
   * @param label 节点显示的标签（文件名）
   * @param filePath 文件的完整路径
   * @description 创建模板文件节点实例，设置节点的基本属性和命令。
   */
  constructor(
    public readonly label: string,
    public readonly filePath: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);

    // 使用VS Code内置的文本文件图标
    this.iconPath = new vscode.ThemeIcon('files');

    // 设置悬停提示
    this.tooltip = `Open ${this.label}`;

    // 设置命令，点击时打开文件
    this.command = {
      command: 'vssm-tool-default-template.openTemplate',
      title: 'Open Template',
      arguments: [this]
    };
  }
}

/**
 * @class DefaultTemplateProvider
 * @brief 默认模板提供者类
 * @description 实现VS Code的TreeDataProvider接口，提供扫描到的DefaultTemplate文件。
 * 扫描src目录下以DefaultTemplate开头的文件并显示在树视图中。
 */
export class DefaultTemplateProvider implements vscode.TreeDataProvider<TemplateNode> {
  // 存储模板文件节点
  private templates: TemplateNode[] = [];

  /**
   * @brief 事件发射器，用于通知树视图数据已更改
   * @description 当需要刷新树视图时，调用fire()方法触发此事件。
   */
  private _onDidChangeTreeData: vscode.EventEmitter<TemplateNode | undefined | void> = new vscode.EventEmitter<
    TemplateNode | undefined | void
  >();

  /**
   * @brief 树视图数据更改事件
   * @description VS Code通过此事件监听数据变化并更新UI。
   */
  readonly onDidChangeTreeData: vscode.Event<TemplateNode | undefined | void> = this._onDidChangeTreeData.event;

  /**
   * @brief 刷新树视图
   * @description 重新扫描模板文件并刷新视图
   */
  refresh(): void {
    this.scanTemplates();
    this._onDidChangeTreeData.fire();
    // console.log('Default template view refreshed!');
    logToVssmToolChannel('Default template view refreshed!');
  }

  /**
   * @brief 扫描模板文件
   * @description 扫描src目录下以DefaultTemplate开头的文件
   */
  private scanTemplates(): void {
    // 清空现有模板列表
    this.templates = [];

    try {
      // 获取src目录路径
      // __filename 是当前文件的完整路径 (src/tree-views/default-template-view.ts)
      // path.join(__filename, '..', '..') 会返回 src 目录的路径
      // 具体解析过程：
      // 1. __filename = d:/sumu_blog/vssm-tool/src/tree-views/default-template-view.ts
      // 2. __filename + '..' = d:/sumu_blog/vssm-tool/src/tree-views/
      // 3. __filename + '..' + '..' = d:/sumu_blog/vssm-tool/src/
      const srcDir = path.join(__filename, '..', '..');

      // 读取src目录中的文件
      const files = fs.readdirSync(srcDir);

      // 过滤出以DefaultTemplate开头的文件
      const templateFiles = files.filter(
        (file) => file.startsWith('DefaultTemplate') && fs.statSync(path.join(srcDir, file)).isFile()
      );

      // 为每个模板文件创建节点
      this.templates = templateFiles.map((file) => new TemplateNode(file, path.join(srcDir, file)));
    } catch (error) {
      console.error('Error scanning template files:', error);
    }
  }

  /**
   * @brief 获取树节点的显示项
   * @param element 树节点元素
   * @return 返回节点本身作为TreeItem
   * @description 返回传入的元素作为TreeItem显示。
   */
  getTreeItem(element: TemplateNode): vscode.TreeItem {
    return element;
  }

  /**
   * @brief 获取子节点
   * @param element 父节点，如果为undefined则获取根节点
   * @return Promise<TemplateNode[]> 返回子节点数组
   * @description 返回存储在this.templates中的数据。如果element为undefined，则返回根节点数据；
   * 如果element存在，则返回空数组（因为模板节点没有子节点）。
   */
  getChildren(element?: TemplateNode): Thenable<TemplateNode[]> {
    // 如果没有父节点，返回模板文件数据
    if (!element) {
      // 如果还没有扫描过模板文件，进行扫描
      if (this.templates.length === 0) {
        this.scanTemplates();
      }
      return Promise.resolve(this.templates);
    }

    // 模板节点没有子节点
    return Promise.resolve([]);
  }

  /**
   * @brief 打开指定模板文件
   * @param element 要打开的模板节点元素
   * @description 在编辑器中打开指定的模板文件
   */
  async openTemplate(element: TemplateNode): Promise<void> {
    if (!element) {
      return;
    }

    try {
      // 使用vscode打开文件
      const document = await vscode.workspace.openTextDocument(element.filePath);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open template file: ${error}`);
    }
  }
}

/**
 * @brief 注册默认模板视图
 * @param context 扩展上下文
 * @return 返回视图ID
 * @description 初始化并注册默认模板树视图。创建DefaultTemplateProvider实例，
 * 注册树数据提供者，并返回视图ID。
 */
export function registerDefaultTemplateView(context: vscode.ExtensionContext): string {
  // 创建默认模板提供者实例
  const templateProvider = new DefaultTemplateProvider();

  // 注册树数据提供者
  vscode.window.registerTreeDataProvider('vssm-tool-default-template', templateProvider);

  // 注册刷新命令
  vscode.commands.registerCommand('vssm-tool-default-template.refreshEntry', () => templateProvider.refresh());

  // 注册打开模板文件命令
  vscode.commands.registerCommand('vssm-tool-default-template.openTemplate', (node: TemplateNode) =>
    templateProvider.openTemplate(node)
  );

  // 返回视图ID
  return 'vssm-tool-default-template';
}
