import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * @class DepNodeProvider
 * @brief 依赖节点提供者类
 * @description 实现VS Code的TreeDataProvider接口，为依赖树视图提供数据。负责读取package.json中的依赖项，并构建树形结构显示。该类管理依赖树的数据源，处理数据刷新、子节点获取等核心功能。
 */
export class DepNodeProvider implements vscode.TreeDataProvider<Dependency> {

  /**
   * @brief 事件发射器，用于通知树视图数据已更改
   * @description 当依赖树需要刷新时，调用fire()方法触发此事件，通知VS Code重新获取数据并更新UI显示。
   */
  private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined | void> = new vscode.EventEmitter<Dependency | undefined | void>();
  
  /**
   * @brief 树视图数据更改事件
   * @description VS Code通过此事件监听数据变化并更新UI。外部可以通过订阅此事件来响应数据变化。
   */
  readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | void> = this._onDidChangeTreeData.event;

  /**
   * @brief 构造函数
   * @param workspaceRoot 工作区根路径
   * @description 初始化依赖节点提供者，传入工作区根路径用于后续文件路径的构建和依赖查找。
   */
  constructor(private workspaceRoot: string | undefined) {
  }

  /**
   * @brief 刷新依赖树视图
   * @description 触发onDidChangeTreeData事件，通知VS Code重新获取数据。调用此方法会导致树视图重新调用getChildren方法获取最新数据。
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
    // console.log('Dependency tree view refreshed');
  }

  /**
   * @brief 获取树节点的显示项
   * @param element 树节点元素
   * @return 返回节点本身作为TreeItem
   * @description 返回传入的元素作为TreeItem显示。在TreeDataProvider中，此方法用于获取节点的显示配置。
   */
  getTreeItem(element: Dependency): vscode.TreeItem {
    return element;
  }

  /**
   * @brief 获取子节点
   * @param element 父节点，如果为undefined则获取根节点
   * @return Promise<Dependency[]> 返回子节点数组
   * @description 这是TreeDataProvider的核心方法，决定树的结构。如果element为undefined，则从工作区根目录的package.json获取顶级依赖；如果element存在，则从该依赖的node_modules中查找其package.json获取子依赖。
   */
  getChildren(element?: Dependency): Thenable<Dependency[]> {
    // 如果没有工作区根路径，显示提示信息
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No dependency in empty workspace');
      return Promise.resolve([]);
    }

    // 如果有父节点（即点击了某个依赖项），获取该依赖项的子依赖
    if (element) {
      return Promise.resolve(this.getDepsInPackageJson(path.join(this.workspaceRoot, 'node_modules', element.label, 'package.json')));
    } else {
      // 如果没有父节点（即根节点），获取当前工作区的package.json中的依赖
      const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
      if (this.pathExists(packageJsonPath)) {
        return Promise.resolve(this.getDepsInPackageJson(packageJsonPath));
      } else {
        // 如果没有package.json文件，显示提示信息
        vscode.window.showInformationMessage('Workspace has no package.json');
        return Promise.resolve([]);
      }
    }
  }

  /**
   * @brief 从package.json文件中读取所有依赖项
   * @param packageJsonPath package.json文件的路径
   * @return Dependency[] 依赖项数组
   * @description 读取指定路径的package.json文件，解析其dependencies和devDependencies字段，将每个依赖转换为Dependency对象。对于已安装的依赖（存在于node_modules中），设置为可折叠状态；对于未安装的依赖，设置为不可折叠状态并添加打开npm页面的命令。
   */
  private getDepsInPackageJson(packageJsonPath: string): Dependency[] {
    const workspaceRoot = this.workspaceRoot;
    if (this.pathExists(packageJsonPath) && workspaceRoot) {
      // 读取并解析package.json文件
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      // 转换函数：将包名和版本号转换为Dependency对象
      const toDep = (moduleName: string, version: string): Dependency => {
        if (this.pathExists(path.join(workspaceRoot, 'node_modules', moduleName))) {
          // 如果node_modules中存在该模块，设置为可折叠状态
          return new Dependency(moduleName, version, vscode.TreeItemCollapsibleState.Collapsed);
        } else {
          // 如果不存在，设置为不可折叠状态，并添加打开npm页面的命令
          return new Dependency(moduleName, version, vscode.TreeItemCollapsibleState.None, {
            command: 'vssm-tool-node-dependencies.openPackageOnNpm',
            title: '',
            arguments: [moduleName]
          });
        }
      };

      // 处理dependencies
      const deps = packageJson.dependencies
        ? Object.keys(packageJson.dependencies).map(dep => toDep(dep, packageJson.dependencies[dep]))
        : [];
      
      // 处理devDependencies
      const devDeps = packageJson.devDependencies
        ? Object.keys(packageJson.devDependencies).map(dep => toDep(dep, packageJson.devDependencies[dep]))
        : [];
      
      // 合并并返回所有依赖项
      return deps.concat(devDeps);
    } else {
      return [];
    }
  }

  /**
   * @brief 检查文件或目录是否存在
   * @param p 路径
   * @return boolean 是否存在
   * @description 使用fs.accessSync同步检查指定路径的文件或目录是否存在。如果访问成功返回true，如果抛出异常返回false。
   */
  private pathExists(p: string): boolean {
    try {
      fs.accessSync(p);
    } catch {
      return false;
    }
    return true;
  }
}

/**
 * @class Dependency
 * @brief 依赖项类
 * @description 表示树视图中的单个依赖节点，继承自vscode.TreeItem。定义了依赖节点的显示属性（如标签、描述、图标）和行为（如点击命令、上下文菜单）。
 */
export class Dependency extends vscode.TreeItem {

  /**
   * @brief 构造函数
   * @param label 节点显示的标签（包名）
   * @param version 包版本号
   * @param collapsibleState 节点的可折叠状态
   * @param command 点击节点时执行的命令
   * @description 创建依赖节点实例，设置节点的基本属性，包括标签、版本、可折叠状态和点击命令。同时设置tooltip和description显示信息。
   */
  constructor(
    public readonly label: string,
    private readonly version: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);

    // 设置鼠标悬停提示
    this.tooltip = `${this.label}-${this.version}`;
    // 设置节点描述（显示在标签右侧）
    this.description = this.version;
  }

  /**
   * @brief 节点图标路径
   * @description 为不同主题（亮色/暗色）提供不同的图标。使用立即执行函数表达式构建图标路径，确保路径正确指向resources/icon目录下的相应SVG文件。
   */
  iconPath = {
    light: (() => {
      // 构建light主题图标路径
      // __filename: 当前模块文件的绝对路径 (如: d:/sumu_blog/vssm-tool/src/tree-views/vssm-tool-node-dependencies.ts)
      // path.join(): Node.js路径拼接方法，自动处理不同操作系统的路径分隔符
      // '..': 向上一级目录
      // 路径解析过程:
      // 1. __filename所在目录: src/tree-views/
      // 2. 第一个'..': 到src/
      // 3. 第二个'..': 到项目根目录d:/sumu_blog/vssm-tool/
      // 4. 第三个'..': 理论上会到d:/sumu_blog/，但实际会被后续路径覆盖
      // 5. 然后进入resources/icon/light/目录
      // 6. 最终指向dependency.svg文件
      const lightPath = path.join(__filename, '..', '..', '..', 'resources', 'icon', 'light', 'dependency.svg');
      // console.log('Light icon path:', lightPath);
      return vscode.Uri.file(lightPath);
    })(),
    dark: (() => {
      const darkPath = path.join(__filename, '..', '..', '..', 'resources', 'icon', 'dark', 'dependency.svg');
      // console.log('Dark icon path:', darkPath);
      return vscode.Uri.file(darkPath);
    })()
  };

  /**
   * @brief 上下文值
   * @description 用于在package.json中定义此节点的上下文菜单项。package.json中的when条件可以使用此值来控制命令的显示，实现基于节点类型的上下文菜单。
   */
  contextValue = 'dependency';
}

/**
 * @brief 注册依赖视图
 * @param context 扩展上下文，用于管理扩展的生命周期
 * @return 返回视图ID，可用于后续引用
 * @description 初始化并注册依赖树视图及其相关命令。创建DepNodeProvider实例，注册树数据提供者，并注册一系列命令（刷新、打开npm页面、编辑、添加、删除）用于与视图交互。
 */
export function registerNodeDependenciesView(context: vscode.ExtensionContext): string {
  // 获取工作区根路径
  const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
    ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;

  // 创建依赖节点提供者实例
  const nodeDependenciesProvider = new DepNodeProvider(rootPath);
  
  // 注册树数据提供者，将视图ID与数据提供者关联
  vscode.window.registerTreeDataProvider('vssm-tool-node-dependencies', nodeDependenciesProvider);
  
  // 注册刷新命令
  vscode.commands.registerCommand('vssm-tool-node-dependencies.refreshEntry', () => nodeDependenciesProvider.refresh());
  
  // 注册打开npm页面命令
  vscode.commands.registerCommand('vssm-tool-node-dependencies.openPackageOnNpm', moduleName => 
    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(`https://www.npmjs.com/package/${moduleName}`))
  );
  
  // 注册编辑条目命令（当前仅显示信息）
  vscode.commands.registerCommand('vssm-tool-node-dependencies-item.editEntry', (node: Dependency) => 
    vscode.window.showInformationMessage(`Successfully called edit entry on ${node.label}.`)
  );
  
  // 注册添加条目命令（当前仅显示信息）
  vscode.commands.registerCommand('vssm-tool-node-dependencies.addEntry', () => 
    vscode.window.showInformationMessage(`Successfully called add entry.`)
  );
  
  // 注册删除条目命令（当前仅显示信息）
  vscode.commands.registerCommand('vssm-tool-node-dependencies-item.deleteEntry', (node: Dependency) => 
    vscode.window.showInformationMessage(`Successfully called delete entry on ${node.label}.`)
  );

  // 返回视图ID，供调用者使用
  return 'vssm-tool-node-dependencies';
}
