// 导入VSCode API模块
import * as vscode from 'vscode';

// 定义匹配Markdown标题的正则表达式
// 使用命名捕获组提取标题级别(#的数量)和标题文本
const MARKDOWN_HEADER_REGEX = /^(?<level>#+)\s+(?<text>.*)$/;

/**
 * 实现Markdown标题悬停功能的提供者类
 */
export class MarkdownHoverProvider implements vscode.HoverProvider {
  /**
   * 实现悬停内容提供方法
   * @param document 当前打开的文档对象
   * @param position 鼠标所在位置
   * @returns 返回Hover对象或null
   */
  provideHover(
    document: vscode.TextDocument, // 当前文档
    position: vscode.Position // 鼠标位置
  ): vscode.ProviderResult<vscode.Hover> {
    try {
      // 获取鼠标所在行的文本内容
      const line = document.lineAt(position.line);

      // 使用正则表达式匹配Markdown标题
      const match = line.text.match(MARKDOWN_HEADER_REGEX);

      // 如果没有匹配到标题或者没有捕获组，返回null
      if (!match?.groups) {
        return null;
      }

      // 从匹配结果中解构出level和text
      const { level, text } = match.groups;

      // 创建Markdown格式的悬停内容
      const hoverContent = new vscode.MarkdownString();

      // 添加标题内容部分
      hoverContent.appendMarkdown(`*Header Content*  \n`);
      // 添加标题级别信息
      hoverContent.appendMarkdown(`*Level: ${level.length}*  \n`);
      // 添加标题文本内容
      hoverContent.appendMarkdown(`*Text : ${text}*`);

      // 返回Hover对象，包含内容和范围
      return new vscode.Hover(hoverContent, line.range);
    } catch (error) {
      // 捕获并记录错误
      console.error('Error in MarkdownHoverProvider:', error);
      // 出错时返回null
      return null;
    }
  }
}

/**
 * 注册Markdown悬停提供者
 * @param context VSCode扩展上下文
 */
export function registerMarkdownHoverProvider(context: vscode.ExtensionContext) {
  const providerName = 'markdownHover';
  // 创建悬停提供者实例
  const provider = new MarkdownHoverProvider();
  // 注册到Markdown语言
  context.subscriptions.push(vscode.languages.registerHoverProvider('markdown', provider));
  return providerName;
}
