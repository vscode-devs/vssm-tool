/**
 * @file VSCode设置视图模块，展示VSCode所有可能的配置文件
 * @module views/vscodeSettingsView
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * @brief VSCode设置文件节点类
 * @class VSCodeSettingsNode
 * @extends vscode.TreeItem
 * @description 表示VSCode设置文件树中的节点，继承自vscode.TreeItem。
 */
export class VSCodeSettingsNode extends vscode.TreeItem {
  /**
   * @brief 构造函数
   * @param label 节点显示的标签
   * @param filePath 文件的完整路径
   * @param isDirectory 是否为目录
   * @param description 节点描述
   * @param parentPath 父目录路径（用于文件夹设置）
   * @description 创建VSCode设置文件节点实例，设置节点的基本属性和命令。
   */
  constructor(
    public readonly label: string,
    public readonly filePath: string,
    public readonly isDirectory: boolean = false,
    public readonly description: string = '',
    public readonly parentPath: string = ''
  ) {
    super(label, isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);

    if (isDirectory) {
      // 目录使用文件夹图标
      this.iconPath = new vscode.ThemeIcon('folder');
      this.contextValue = 'directory';
    } else {
      // 文件使用JSON图标
      this.iconPath = new vscode.ThemeIcon('json');
      this.contextValue = 'settings-file';
      
      // 设置悬停提示
      this.tooltip = `Open ${this.label}${description ? '\n' + description : ''}`;

      // 设置命令，点击时打开文件
      this.command = {
        command: 'vssm-tool-vscode-settings.openFile',
        title: 'Open File',
        arguments: [this]
      };
    }
  }
}

/**
 * @brief VSCode设置提供者类
 * @class VSCodeSettingsProvider
 * @implements vscode.TreeDataProvider<VSCodeSettingsNode>
 * @description 实现VS Code的TreeDataProvider接口，提供扫描到的VSCode设置文件。
 */
export class VSCodeSettingsProvider implements vscode.TreeDataProvider<VSCodeSettingsNode> {
  // 存储设置文件节点
  private settingsNodes: VSCodeSettingsNode[] = [];

  /**
   * @brief 事件发射器，用于通知树视图数据已更改
   * @description 当需要刷新树视图时，调用fire()方法触发此事件。
   */
  private _onDidChangeTreeData: vscode.EventEmitter<VSCodeSettingsNode | undefined | void> = new vscode.EventEmitter<
    VSCodeSettingsNode | undefined | void
  >();

  /**
   * @brief 树视图数据更改事件
   * @description VS Code通过此事件监听数据变化并更新UI。
   */
  readonly onDidChangeTreeData: vscode.Event<VSCodeSettingsNode | undefined | void> = this._onDidChangeTreeData.event;

  /**
   * @brief 刷新树视图
   * @description 重新扫描设置文件并刷新视图
   */
  refresh(): void {
    this.scanSettingsFiles();
    this._onDidChangeTreeData.fire();
    console.log('VSCode settings view refreshed!');
  }

  /**
   * @brief 扫描VSCode设置文件
   * @description 扫描所有可能的VSCode设置文件位置
   */
  private scanSettingsFiles(): void {
    // 清空现有节点列表
    this.settingsNodes = [];

    try {
      // 1. 默认配置文件（只读，显示为信息）
      const defaultSettingsNode = new VSCodeSettingsNode(
        'Default Settings',
        '',  // 空路径，因为这是虚拟节点
        false,
        'VS Code default settings (read-only)'
      );
      // 为默认设置节点设置特殊图标和命令
      defaultSettingsNode.iconPath = new vscode.ThemeIcon('info');
      defaultSettingsNode.contextValue = 'default-settings';
      // 保留命令，以便能响应点击事件
      // 注意：这里我们依赖于 VSCodeSettingsNode 构造函数自动为非目录节点设置命令
      this.settingsNodes.push(defaultSettingsNode);

      // 2. 用户配置文件
      const userSettingsPath = this.getUserSettingsPath();
      if (userSettingsPath && fs.existsSync(userSettingsPath)) {
        this.settingsNodes.push(new VSCodeSettingsNode(
          'User Settings',
          userSettingsPath,
          false,
          'Global user settings'
        ));
      }

      // 3. 远程设置
      const remoteSettingsPath = this.getRemoteSettingsPath();
      if (remoteSettingsPath && fs.existsSync(remoteSettingsPath)) {
        this.settingsNodes.push(new VSCodeSettingsNode(
          'Remote Settings',
          remoteSettingsPath,
          false,
          'Remote development settings'
        ));
      }

      // 3.1. 本地Windows用户设置 (仅在远程会话中显示提示)
      if (vscode.env.remoteName) {
        const localWindowsSettingsNode = new VSCodeSettingsNode(
          'Local Windows User Settings (Not Accessible)',
          '', // 空路径，因为无法直接访问
          false,
          'Cannot access local Windows user settings directly from a remote SSH session.'
        );
        localWindowsSettingsNode.iconPath = new vscode.ThemeIcon('warning'); // 使用警告图标
        localWindowsSettingsNode.contextValue = 'inaccessible-settings'; // 特殊上下文值
        // 移除默认的打开文件命令，因为它无法打开
        localWindowsSettingsNode.command = undefined;
        this.settingsNodes.push(localWindowsSettingsNode);
      }

      // 4. 工作区设置
      const workspaceSettings = this.getWorkspaceSettings();
      if (workspaceSettings.length > 0) {
        const workspaceNode = new VSCodeSettingsNode(
          'Workspace Settings',
          '',
          true,
          'Workspace-level settings'
        );
        this.settingsNodes.push(workspaceNode);
      }

      // 5. 文件夹设置
      const folderSettings = this.getFolderSettings();
      if (folderSettings.length > 0) {
        const folderNode = new VSCodeSettingsNode(
          'Folder Settings',
          '',
          true,
          'Folder-level settings'
        );
        this.settingsNodes.push(folderNode);
      }

    } catch (error) {
      console.error('Error scanning VSCode settings files:', error);
    }
  }

  /**
   * @brief 获取用户设置文件路径
   * @private
   * @returns {string | null} 用户设置文件路径
   */
  private getUserSettingsPath(): string | null {
    const platform = os.platform();
    
    if (platform === 'win32') {
      // Windows: %APPDATA%/Code/User/settings.json
      const appData = process.env.APPDATA;
      if (appData) {
        return path.join(appData, 'Code', 'User', 'settings.json');
      }
    } else if (platform === 'darwin') {
      // macOS: ~/Library/Application Support/Code/User/settings.json
      const home = os.homedir();
      if (home) {
        return path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
      }
    } else {
      // Linux: ~/.config/Code/User/settings.json
      const home = os.homedir();
      if (home) {
        return path.join(home, '.config', 'Code', 'User', 'settings.json');
      }
    }
    
    return null;
  }

  /**
   * @brief 获取远程设置文件路径
   * @private
   * @returns {string | null} 远程设置文件路径
   */
  private getRemoteSettingsPath(): string | null {
    const home = os.homedir();
    if (home) {
      return path.join(home, '.vscode-server', 'data', 'Machine', 'settings.json');
    }
    return null;
  }

  /**
   * @brief 获取工作区设置文件
   * @private
   * @returns {VSCodeSettingsNode[]} 工作区设置文件节点数组
   */
  private getWorkspaceSettings(): VSCodeSettingsNode[] {
    const nodes: VSCodeSettingsNode[] = [];
    
    if (vscode.workspace.workspaceFile) {
      // 当前有工作区文件
      const workspaceFilePath = vscode.workspace.workspaceFile.fsPath;
      nodes.push(new VSCodeSettingsNode(
        path.basename(workspaceFilePath),
        workspaceFilePath,
        false,
        'Workspace configuration file'
      ));
    }
    
    return nodes;
  }

  /**
   * @brief 获取文件夹设置文件
   * @private
   * @returns {VSCodeSettingsNode[]} 文件夹设置文件节点数组
   */
  private getFolderSettings(): VSCodeSettingsNode[] {
    const nodes: VSCodeSettingsNode[] = [];
    
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        // 检查文件夹下是否存在.vscode/settings.json文件
        const settingsPath = path.join(folder.uri.fsPath, '.vscode', 'settings.json');
        if (fs.existsSync(settingsPath)) {
          // 只有在存在配置文件时才创建文件夹节点
          const folderNode = new VSCodeSettingsNode(
            folder.name,
            folder.uri.fsPath,
            true,
            `Workspace folder: ${folder.name}`,
            folder.uri.fsPath
          );
          nodes.push(folderNode);
        }
      }
    }
    
    return nodes;
  }

  /**
   * @brief 获取文件夹下的子目录和设置文件
   * @private
   * @param folderPath 文件夹路径
   * @returns {VSCodeSettingsNode[]} 子目录和设置文件节点数组
   */
  private getFolderSettingsFiles(folderPath: string): VSCodeSettingsNode[] {
    const nodes: VSCodeSettingsNode[] = [];
    
    try {
      const items = fs.readdirSync(folderPath);
      
      for (const item of items) {
        const itemPath = path.join(folderPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          // 如果是目录，检查是否有.vscode/settings.json
          const settingsPath = path.join(itemPath, '.vscode', 'settings.json');
          if (fs.existsSync(settingsPath)) {
            // 创建目录节点
            const dirNode = new VSCodeSettingsNode(
              item,
              itemPath,
              true,
              `Directory: ${item}`,
              itemPath
            );
            nodes.push(dirNode);
          }
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${folderPath}:`, error);
    }
    
    return nodes;
  }

  /**
   * @brief 获取指定目录下的settings.json文件
   * @private
   * @param dirPath 目录路径
   * @returns {VSCodeSettingsNode[]} 设置文件节点数组
   */
  private getSettingsFileForDirectory(dirPath: string): VSCodeSettingsNode[] {
    const nodes: VSCodeSettingsNode[] = [];
    
    const settingsPath = path.join(dirPath, '.vscode', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      nodes.push(new VSCodeSettingsNode(
        'settings.json',
        settingsPath,
        false,
        'VSCode settings file'
      ));
    }
    
    return nodes;
  }

  /**
   * @brief 获取树节点的显示项
   * @param element 树节点元素
   * @return 返回节点本身作为TreeItem
   * @description 返回传入的元素作为TreeItem显示。
   */
  getTreeItem(element: VSCodeSettingsNode): vscode.TreeItem {
    return element;
  }

  /**
   * @brief 获取子节点
   * @param element 父节点，如果为undefined则获取根节点
   * @return Promise<VSCodeSettingsNode[]> 返回子节点数组
   * @description 返回存储在this.settingsNodes中的数据。如果element为undefined，则返回根节点数据；
   * 如果element存在，则返回相应的子节点。
   */
  getChildren(element?: VSCodeSettingsNode): Thenable<VSCodeSettingsNode[]> {
    if (!element) {
      // 如果还没有扫描过设置文件，进行扫描
      if (this.settingsNodes.length === 0) {
        this.scanSettingsFiles();
      }
      return Promise.resolve(this.settingsNodes);
    }

    // 处理子节点
    if (element.label === 'Workspace Settings') {
      return Promise.resolve(this.getWorkspaceSettings());
    } else if (element.label === 'Folder Settings') {
      return Promise.resolve(this.getFolderSettings());
    } else if (element.isDirectory && element.parentPath) {
      // 如果是文件夹节点，获取该文件夹下的设置文件
      if (element.label.startsWith('Workspace folder:')) {
        // 这是工作区文件夹，显示其下的子目录
        return Promise.resolve(this.getFolderSettingsFiles(element.filePath));
      } else {
        // 这是子目录，显示其下的settings.json文件
        return Promise.resolve(this.getSettingsFileForDirectory(element.filePath));
      }
    }

    // 其他节点没有子节点
    return Promise.resolve([]);
  }

  /**
   * @brief 打开指定设置文件
   * @param element 要打开的设置节点元素
   * @description 在编辑器中打开指定的设置文件
   */
  async openFile(element: VSCodeSettingsNode): Promise<void> {
    if (!element || element.isDirectory) {
      return;
    }

    // 特殊处理默认设置节点
    if (element.contextValue === 'default-settings') {
      // 执行VSCode命令打开默认设置
      await vscode.commands.executeCommand('workbench.action.openRawDefaultSettings');
      return;
    }

    // 检查文件路径是否存在
    if (!element.filePath) {
      return;
    }

    try {
      // 使用vscode打开文件
      const document = await vscode.workspace.openTextDocument(element.filePath);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open settings file: ${error}`);
    }
  }
}

/**
 * @brief 注册VSCode设置视图
 * @param context 扩展上下文
 * @return 返回视图ID
 * @description 初始化并注册VSCode设置树视图。创建VSCodeSettingsProvider实例，
 * 注册树数据提供者，并返回视图ID。
 */
export function registerVSCodeSettingsView(context: vscode.ExtensionContext): string {
  // 创建VSCode设置提供者实例
  const settingsProvider = new VSCodeSettingsProvider();

  // 注册树数据提供者
  vscode.window.registerTreeDataProvider('vssm-tool-vscode-settings', settingsProvider);

  // 注册刷新命令
  vscode.commands.registerCommand('vssm-tool-vscode-settings.refreshEntry', () => settingsProvider.refresh());

  // 注册打开文件命令
  vscode.commands.registerCommand('vssm-tool-vscode-settings.openFile', (node: VSCodeSettingsNode) =>
    settingsProvider.openFile(node)
  );

  // 返回视图ID
  return 'vssm-tool-vscode-settings';
}
