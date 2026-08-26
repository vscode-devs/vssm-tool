/**
 * @file 默认模板视图模块，展示扫描到的 DefaultTemplate.* 文件
 * @module views/defaultTemplate
 * @details 原本是一个原生 TreeView（vssm-tool-default-template），其内容现已搬进 chat webview 渲染，
 *          故改为实现 SnapshottableProvider：供 webview 取快照，点击节点在编辑器打开该模板文件。
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { logToVssmToolChannel } from '../helpers/utils';
import { registerSnapshottableProvider, type SnapNode, type SnapshottableProvider } from './registry';

/** @brief 单个模板文件条目（纯数据） */
interface TemplateEntry {
  file: string;
  filePath: string;
}

/**
 * @class DefaultTemplateProvider
 * @brief 默认模板提供者，实现 SnapshottableProvider 供 chat webview 消费
 * @details 扫描注入的模板目录下以 DefaultTemplate 开头的文件（postbuild 会把 src/template 树拷进 out/template），
 *          快照为单层 SnapNode[]，点击节点打开对应文件。
 */
export class DefaultTemplateProvider implements SnapshottableProvider {
  /** @brief 对应原 view 的 id（webview 导航/快照路由用） */
  public readonly viewId = 'vssm-tool-default-template';

  /** @brief 注入的模板文件所在目录（绝对路径） */
  private readonly _templateDir: string;

  /** @brief 扫描到的模板文件列表（纯数据） */
  private templates: TemplateEntry[] = [];

  /**
   * @brief 构造函数，注入模板目录
   * @constructor
   * @param templateDir 模板文件所在目录的绝对路径
   */
  constructor(templateDir: string) {
    this._templateDir = templateDir;
  }

  /** @brief 确保已扫描过模板文件 */
  private ensureScanned(): void {
    if (this.templates.length === 0) {
      this.scanTemplates();
    }
  }

  /**
   * @brief 扫描模板文件
   * @private
   * @details 扫描构造时注入的 _templateDir 目录，与编译产物布局无关。
   */
  private scanTemplates(): void {
    this.templates = [];
    try {
      const files = fs.readdirSync(this._templateDir);
      const templateFiles = files.filter(
        (file) => file.startsWith('DefaultTemplate') && fs.statSync(path.join(this._templateDir, file)).isFile()
      );
      this.templates = templateFiles.map((file) => ({ file, filePath: path.join(this._templateDir, file) }));
    } catch (error) {
      console.error('Error scanning template files:', error);
    }
  }

  /**
   * @brief 返回完整树快照（SnapshottableProvider 契约）
   * @returns SnapNode[] 单层模板文件列表，可直接 postMessage 给 webview
   */
  getSnapshot(): SnapNode[] {
    this.ensureScanned();
    return this.templates.map(
      (t): SnapNode => ({
        id: t.filePath,
        label: t.file,
        icon: 'file',
        collapsibleState: 'none',
        // 点击节点打开该模板文件
        command: { command: 'vssm-tool-default-template.openTemplate', args: [t.filePath] }
      })
    );
  }

  /** @brief webview 请求刷新：重新扫描（日志保留以便排查） */
  refresh(): void {
    this.templates = [];
    this.scanTemplates();
    logToVssmToolChannel('Default template view refreshed!');
  }

  /**
   * @brief 打开指定模板文件
   * @param filePath 要打开的文件绝对路径
   */
  async openTemplate(filePath: string): Promise<void> {
    if (!filePath) {
      return;
    }
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open template file: ${error}`);
    }
  }
}

/**
 * @brief 注册默认模板视图到 webview 快照注册表
 * @param {vscode.ExtensionContext} context - 扩展上下文（用于解析模板目录）
 * @returns {string} viewId（供 extension.ts 去重注册使用）
 * @details 注意：不再注册原生 TreeView（其内容已搬进 webview）。
 *          模板目录在注册处经 context.asAbsolutePath 解析后注入，provider 不感知布局。
 */
export function registerDefaultTemplateView(context: vscode.ExtensionContext): string {
  const templateProvider = new DefaultTemplateProvider(context.asAbsolutePath(path.join('out', 'template', 'default')));

  // 注册打开模板文件命令（参数改为 filePath 字符串，由 webview nodeCommand 触发）
  vscode.commands.registerCommand('vssm-tool-default-template.openTemplate', (filePath: string) =>
    templateProvider.openTemplate(filePath)
  );

  registerSnapshottableProvider(templateProvider);
  return templateProvider.viewId;
}
