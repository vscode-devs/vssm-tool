/**
 * @file 各项目类型的模板配置登记表：新增项目类型只需扩展本文件
 * @module cmd/init-project/templates
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  fetchLatestNpmVersion,
  fetchLatestNpmVersionInMajor,
  mergePackageJsonTemplate,
  refreshDevDependencyVersions
} from '../../helpers/npmRegistry';
import type { ProjectTemplateConfig } from './types';

/**
 * @brief 项目类型选项（QuickPick 展示用）
 */
export const projectTypes = [
  { label: 'C (VSCode)', value: 'c-vscode', description: 'Initialize a C project with VSCode configuration' },
  { label: 'CNB', value: 'cnb', description: 'Initialize CNB CI/CD configuration' },
  {
    label: 'NPM Package',
    value: 'npm-package',
    description: 'Initialize an ESM npm package with TypeScript/ESLint/Prettier'
  }
];

/**
 * @brief C工程初始化的特殊目标名映射表
 * @details 键为工作区目标文件名，值为源文件路径（相对运行时资源根目录 out/）。
 *          列入此表的目标不从模板目录按原名拷贝，而是从指定源文件拷贝到目标名。
 *          - .clang-format：与单独生成命令共用 DefaultTemplate.clang-format，保证同一份C语言模板；
 *          - .gitignore：源文件命名为 C.gitignore，避免在扩展仓库中被当作忽略文件；
 *          - README.md：从扩展内置 DefaultTemplate.README.md 拷贝。
 */
const cVscodeSpecialTargets: Record<string, string> = {
  '.clang-format': path.join('template', 'default', 'DefaultTemplate.clang-format'),
  '.gitignore': path.join('template', 'c-vscode', 'C.gitignore'),
  'README.md': path.join('template', 'default', 'DefaultTemplate.README.md')
};

/**
 * @brief CNB工程初始化的特殊目标名映射表
 * @details .editorconfig 从扩展内置的 DefaultTemplate.editorconfig 拷贝，与单独生成命令共用同一份模板；
 *          README.md 从扩展内置的 DefaultTemplate.README.md 拷贝。
 */
const cnbSpecialTargets: Record<string, string> = {
  '.editorconfig': path.join('template', 'default', 'DefaultTemplate.editorconfig'),
  'README.md': path.join('template', 'default', 'DefaultTemplate.README.md')
};

/**
 * @brief 各项目类型的模板配置表
 * @details 新增项目类型只需在此登记，注册流程按 projectTypes 循环自动生效。
 */
export const PROJECT_TEMPLATES: Record<string, ProjectTemplateConfig> = {
  'c-vscode': { templateRelPath: path.join('template', 'c-vscode'), specialTargets: cVscodeSpecialTargets },
  cnb: { templateRelPath: path.join('template', 'cnb'), specialTargets: cnbSpecialTargets },
  'npm-package': {
    templateRelPath: path.join('template', 'npm-package'),
    specialTargets: {},
    // 拷贝后处理：
    // - package.json 为全新创建 → devDependencies 全量刷新为生成时刻最新版本
    // - package.json 已存在 → 字段级合并（缺则补、有不覆），仅对新增依赖做版本刷新
    postCopy: async (ctx) => {
      const pkgRel = 'package.json';
      const targetPkgPath = path.join(ctx.targetRoot, pkgRel);
      if (!fs.existsSync(targetPkgPath)) {
        return;
      }

      const created = ctx.report.created.includes(pkgRel);
      let onlyNewDeps: Set<string> | undefined;

      if (!created) {
        const merge = mergePackageJsonTemplate(path.join(ctx.templateDir, pkgRel), targetPkgPath);
        if (merge.changed) {
          vscode.window.showInformationMessage(
            `package.json 已合并：新增 ${merge.addedTopLevelFields.length} 个字段、` +
              `${merge.addedScripts.length} 个脚本、${merge.addedDevDependencies.length} 个依赖；已有内容保持不变。`
          );
          onlyNewDeps = new Set(merge.addedDevDependencies);
        } else {
          // 目标与模板字段完全一致，无需任何处理
          return;
        }
      }

      // typescript 上限锁在 5.x 大版本：@typescript-eslint 8.x 的 peer 约束为 <6.1.0，
      // 盲取 latest 会装出 TS7 导致 npm install 直接失败；待生态支持后移除该上限
      const fetcher = async (name: string) =>
        name === 'typescript' ? fetchLatestNpmVersionInMajor(name, 5) : fetchLatestNpmVersion(name);

      const { updated, total } = await refreshDevDependencyVersions(targetPkgPath, fetcher, onlyNewDeps);
      if (total > 0 && updated === total) {
        vscode.window.showInformationMessage(`已将 ${updated} 个 devDependencies 更新为最新版本。`);
      } else if (updated === 0) {
        vscode.window.showWarningMessage('未能连接 npm registry，devDependencies 保留模板内置版本范围。');
      } else {
        vscode.window.showWarningMessage(`${total - updated} 个依赖未获取到最新版本，已保留模板内置范围。`);
      }
    }
  }
};
