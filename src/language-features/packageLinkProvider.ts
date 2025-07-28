// 导入VSCode API模块
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * @class PackageLinkProvider
 * @implements {vscode.DocumentLinkProvider}
 * @description 提供在package.json文件中点击依赖包名跳转到本地node_modules对应包的功能
 *              支持在dependencies和devDependencies中的包跳转
 *              优先跳转到包的README.md文件，如果不存在则跳转到包的根目录
 */
export class PackageLinkProvider implements vscode.DocumentLinkProvider {
  /**
   * @brief 提供文档链接功能，扫描package.json文件中的依赖项并创建可点击的链接
   *        当用户在package.json中Ctrl+点击包名时，会跳转到node_modules中对应的包
   *        支持dependencies和devDependencies中的包
   * @param {vscode.TextDocument} document - 当前打开的文档对象
   * @param {vscode.CancellationToken} token - 取消令牌，用于在操作被取消时提前返回
   * @returns {vscode.ProviderResult<vscode.DocumentLink[]>} 返回文档链接数组，包含所有可点击的包名链接
   */
  provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentLink[]> {
    // 只处理package.json文件，如果不是则返回空数组
    if (path.basename(document.fileName) !== 'package.json') {
      return [];
    }

    // 检查取消令牌，如果操作被取消则立即返回空数组
    // 这是VS Code扩展开发中的重要性能优化机制
    // 当用户快速移动光标或编辑文件时，VS Code可能会取消之前的请求
    // 通过检查取消令牌，可以避免浪费资源处理已经过时的请求
    // 提升编辑器响应速度和整体性能
    if (token.isCancellationRequested) {
      return [];
    }

    // 存储找到的所有文档链接
    const links: vscode.DocumentLink[] = [];
    // 获取文档的完整文本内容
    const text = document.getText();
    // 将文本按行分割成数组，便于逐行处理
    const lines = text.split('\n');

    // 遍历每一行，查找可能的依赖项
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      // 获取当前行的文本
      const line = lines[lineIndex];
      // 使用正则表达式匹配依赖项行，例如 "@types/mocha": "^10.0.10" 或 "typescript": "5.8.3"
      // 正则表达式解释：匹配引号内的包名，后跟冒号和空格，再跟引号内的版本号
      const regex = /"([^"]+)":\s*"([^"]+)"/g;
      // 用于存储正则表达式匹配结果
      let match;

      // 在当前行中查找所有匹配的依赖项
      while ((match = regex.exec(line)) !== null) {
        // 提取匹配到的包名
        const packageName = match[1];
        // 提取匹配到的包版本号
        const packageVersion = match[2];

        // 检查当前行是否在dependencies或devDependencies对象内
        if (this.isDependencyLine(line, lines, lineIndex)) {
          // 计算链接的起始位置（匹配到的包名的开始位置）
          // match.index是匹配到的整个字符串的起始位置，+1是跳过开头的引号
          const startIndex = match.index + 1;
          // 计算链接的结束位置（包名的结束位置）
          const endIndex = startIndex + packageName.length;
          // 创建VS Code位置对象，指定行号和列号
          const position = new vscode.Position(lineIndex, startIndex);
          // 创建VS Code范围对象，表示链接覆盖的文本范围
          const range = new vscode.Range(position, position.translate(0, packageName.length));

          // 创建文档链接对象，指定链接范围和目标URI
          const packagePath = this.getPackagePath(packageName);
          const link = new vscode.DocumentLink(range, vscode.Uri.file(packagePath));
          // 设置鼠标悬停时显示的提示文本
          link.tooltip = `Open ${packageName} 's local link.`;
          // 将创建的链接添加到链接数组中
          links.push(link);
        }
      }
    }

    // 返回所有找到的文档链接
    return links;
  }

  /**
   * @brief 判断当前行是否在dependencies或devDependencies对象内，通过向上查找最近的"dependencies"或"devDependencies"关键字来确定
   * @param {string} currentLine - 当前行的文本内容
   * @param {string[]} allLines - 文档所有行的文本数组
   * @param {number} lineIndex - 当前行的索引位置
   * @returns {boolean} 如果当前行在依赖项对象内返回true，否则返回false
   */
  private isDependencyLine(currentLine: string, allLines: string[], lineIndex: number): boolean {
    // 从当前行开始向上遍历，查找最近的"dependencies"或"devDependencies"声明
    for (let i = lineIndex; i >= 0; i--) {
      // 获取当前检查的行文本
      const line = allLines[i];
      // 检查当前行是否包含dependencies或devDependencies关键字
      if (line.includes('"dependencies"') || line.includes('"devDependencies"')) {
        // 找到依赖项声明，说明当前行在其作用域内
        return true;
      }
      // 如果遇到对象结束符"}"，说明已经超出了依赖项对象的范围
      // 停止查找，因为继续向上不会找到相关的依赖项声明
      if (line.includes('}')) {
        break;
      }
    }
    // 未找到依赖项声明，说明当前行不在dependencies或devDependencies对象内
    return false;
  }

  /**
   * @brief 获取包在node_modules中的路径，优先返回README.md文件路径，如果README.md不存在，则返回包的根目录路径
   * @param {string} packageName - 要查找的包名
   * @returns {string} 返回包的README.md文件路径或包的根目录路径
   */
  private getPackagePath(packageName: string): string {
    // 获取当前工作区文件夹列表
    const workspaceFolders = vscode.workspace.workspaceFolders;
    // 检查是否存在工作区文件夹，如果没有则抛出错误
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder found');
    }

    // 获取第一个工作区文件夹的文件系统路径
    const workspacePath = workspaceFolders[0].uri.fsPath;
    // 构建node_modules中包的README.md文件的完整路径
    const readmePath = path.join(workspacePath, 'node_modules', packageName, 'README.md');

    // 检查README.md文件是否存在
    if (fs.existsSync(readmePath)) {
      // 如果存在，返回README.md文件的路径
      return readmePath;
    }

    // 如果README.md不存在，构建包的根目录路径
    const packagePath = path.join(workspacePath, 'node_modules', packageName);
    // 检查包目录是否存在，如果不存在则记录警告
    if (!fs.existsSync(packagePath)) {
      console.warn(`Package ${packageName} not found in node_modules`);
    }

    // 返回包的根目录路径（无论是否存在）
    return packagePath;
  }
}

/**
 * @brief 注册package.json依赖项链接提供者
 * @param context VSCode扩展上下文
 */
export function registerPackageLinkProvider(context: vscode.ExtensionContext) {
  const providerName = 'packageLink';
  // 创建链接提供者实例
  const provider = new PackageLinkProvider();
  // 注册到JSON语言
  context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(
    { language: 'json', pattern: '**/package.json' },
    provider
  ));

  // 监听活动编辑器变化事件
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor && editor.document.fileName.includes('node_modules') &&
      editor.document.fileName.endsWith('README.md')) {
      // 在资源管理器中显示当前文件
      vscode.commands.executeCommand('revealInExplorer', editor.document.uri);
    }
  }));

  return providerName;
}
