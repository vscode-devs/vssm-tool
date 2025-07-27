import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class DepNodeProvider implements vscode.TreeDataProvider<Dependency> {

  private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined | void> = new vscode.EventEmitter<Dependency | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | void> = this._onDidChangeTreeData.event;

  constructor(private workspaceRoot: string | undefined) {
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
    // console.log('Dependency tree view refreshed');
  }

  getTreeItem(element: Dependency): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Dependency): Thenable<Dependency[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No dependency in empty workspace');
      return Promise.resolve([]);
    }

    if (element) {
      return Promise.resolve(this.getDepsInPackageJson(path.join(this.workspaceRoot, 'node_modules', element.label, 'package.json')));
    } else {
      const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
      if (this.pathExists(packageJsonPath)) {
        return Promise.resolve(this.getDepsInPackageJson(packageJsonPath));
      } else {
        vscode.window.showInformationMessage('Workspace has no package.json');
        return Promise.resolve([]);
      }
    }

  }

  /**
   * Given the path to package.json, read all its dependencies and devDependencies.
   */
  private getDepsInPackageJson(packageJsonPath: string): Dependency[] {
    const workspaceRoot = this.workspaceRoot;
    if (this.pathExists(packageJsonPath) && workspaceRoot) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      const toDep = (moduleName: string, version: string): Dependency => {
        if (this.pathExists(path.join(workspaceRoot, 'node_modules', moduleName))) {
          return new Dependency(moduleName, version, vscode.TreeItemCollapsibleState.Collapsed);
        } else {
          return new Dependency(moduleName, version, vscode.TreeItemCollapsibleState.None, {
            command: 'vssm-tool-node-dependencies.openPackageOnNpm',
            title: '',
            arguments: [moduleName]
          });
        }
      };

      const deps = packageJson.dependencies
        ? Object.keys(packageJson.dependencies).map(dep => toDep(dep, packageJson.dependencies[dep]))
        : [];
      const devDeps = packageJson.devDependencies
        ? Object.keys(packageJson.devDependencies).map(dep => toDep(dep, packageJson.devDependencies[dep]))
        : [];
      return deps.concat(devDeps);
    } else {
      return [];
    }
  }

  private pathExists(p: string): boolean {
    try {
      fs.accessSync(p);
    } catch {
      return false;
    }

    return true;
  }
}

export class Dependency extends vscode.TreeItem {

  constructor(
    public readonly label: string,
    private readonly version: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);

    this.tooltip = `${this.label}-${this.version}`;
    this.description = this.version;
  }

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

  contextValue = 'dependency';
}


/**
 * @brief 注册依赖视图
 * @param {vscode.ExtensionContext} context - 扩展上下文
 * @returns {string} 视图ID
 */
export function registerNodeDependenciesView(context: vscode.ExtensionContext): string {
  const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
    ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;

  // Samples of `window.registerTreeDataProvider`
  const nodeDependenciesProvider = new DepNodeProvider(rootPath);
  vscode.window.registerTreeDataProvider('vssm-tool-node-dependencies', nodeDependenciesProvider);
  vscode.commands.registerCommand('vssm-tool-node-dependencies.refreshEntry', () => nodeDependenciesProvider.refresh());
  vscode.commands.registerCommand('vssm-tool-node-dependencies.openPackageOnNpm', moduleName => vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(`https://www.npmjs.com/package/${moduleName}`)));
  vscode.commands.registerCommand('vssm-tool-node-dependencies-item.editEntry', (node: Dependency) => vscode.window.showInformationMessage(`Successfully called edit entry on ${node.label}.`));
  vscode.commands.registerCommand('vssm-tool-node-dependencies.addEntry', () => vscode.window.showInformationMessage(`Successfully called add entry.`));
  vscode.commands.registerCommand('vssm-tool-node-dependencies-item.deleteEntry', (node: Dependency) => vscode.window.showInformationMessage(`Successfully called delete entry on ${node.label}.`));

  // 返回视图ID
  return 'vssm-tool-node-dependencies';
}
