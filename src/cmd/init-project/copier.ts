/**
 * @file 模板目录拷贝器：同名拷贝 + 特殊目标改名拷贝，逐条容错并输出明细报告
 * @module cmd/init-project/copier
 */

import * as fs from 'fs';
import * as path from 'path';
import { withFileRetry } from '../../helpers/utils';
import type { TemplateCopyReport, TemplateCopyResult } from './types';

/**
 * @brief 将模板目录拷贝到工作区根目录，支持特殊目标名映射
 * @details 先遍历 templateDir 下所有文件及目录，按原名拷贝到 targetRoot；
 *          再按 specialTargets 将指定源文件拷贝为目标名。
 *          specialTargets 的键为目标文件名，值为源文件路径（相对运行时资源根目录 out/）。
 *          若某特殊目标的源文件恰好位于 templateDir 内，则在常规遍历时自动跳过，避免重复拷贝。
 *          目标位置已存在同名文件或目录时跳过。
 * @param templateDir 模板目录的绝对路径
 * @param targetRoot 工作区根目录的绝对路径
 * @param extensionRoot 运行时资源根目录（out/）的绝对路径（解析 specialTargets 源文件用）
 * @param specialTargets 特殊目标名到源文件（相对运行时资源根目录 out/）的映射表
 * @return 返回拷贝结果（含明细报告）
 */
export function copyTemplateTree(
  templateDir: string,
  targetRoot: string,
  extensionRoot: string,
  specialTargets: Record<string, string>
): TemplateCopyResult {
  // 收集位于模板目录内的特殊源文件名，常规遍历时跳过这些条目（避免重复拷贝）
  const skipInTemplate = new Set<string>();
  for (const srcRel of Object.values(specialTargets)) {
    const srcAbs = path.resolve(extensionRoot, srcRel);
    if (srcAbs.startsWith(`${templateDir}${path.sep}`)) {
      skipInTemplate.add(path.basename(srcAbs));
    }
  }

  let skipped = false;
  let copied = false;
  const report: TemplateCopyReport = { created: [], existed: [] };

  // 1) 常规拷贝：模板目录中未被特殊处理的条目按原名拷贝。
  //    逐条容错：单个条目失败（如被占用）只跳过该项，不中断整体初始化
  for (const entry of fs.readdirSync(templateDir)) {
    if (skipInTemplate.has(entry)) {
      continue;
    }

    const srcPath = path.join(templateDir, entry);
    const destPath = path.join(targetRoot, entry);

    if (fs.existsSync(destPath)) {
      skipped = true;
      report.existed.push(entry);
      continue;
    }

    try {
      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        copyDirSync(srcPath, destPath);
      } else {
        withFileRetry(() => fs.copyFileSync(srcPath, destPath));
      }
      copied = true;
      report.created.push(entry);
    } catch (err) {
      console.error(`[initProject] Skip "${entry}":`, err instanceof Error ? err.message : err);
      skipped = true;
    }
  }

  // 2) 特殊目标：从指定源文件拷贝到对应目标名（同样逐条容错）
  for (const [destName, srcRel] of Object.entries(specialTargets)) {
    const srcAbs = path.resolve(extensionRoot, srcRel);
    const destPath = path.join(targetRoot, destName);

    if (fs.existsSync(destPath)) {
      skipped = true;
      report.existed.push(destName);
      continue;
    }

    if (!fs.existsSync(srcAbs)) {
      continue;
    }

    try {
      withFileRetry(() => fs.copyFileSync(srcAbs, destPath));
      copied = true;
      report.created.push(destName);
    } catch (err) {
      console.error(`[initProject] Skip special target "${destName}":`, err instanceof Error ? err.message : err);
      skipped = true;
    }
  }

  return { copied, skipped, report };
}

/**
 * @brief 同步递归拷贝目录或文件
 * @details 将源路径下的目录或文件递归拷贝到目标路径。若源路径为文件则直接复制；
 *          若为目录则递归创建子目录并复制所有内容。
 * @param src 源文件或源目录的绝对路径
 * @param dest 目标文件或目标目录的绝对路径
 * @return 无返回值
 * @throws 当源路径不存在时抛出Error
 */
function copyDirSync(src: string, dest: string): void {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }

  const stat = fs.statSync(src);
  if (!stat.isDirectory()) {
    withFileRetry(() => fs.copyFileSync(src, dest));
    return;
  }

  // recursive mkdir 目标已存在时安全无操作；瞬态 EPERM 由重试兜底
  withFileRetry(() => fs.mkdirSync(dest, { recursive: true }));

  const entries = fs.readdirSync(src);
  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const entryStat = fs.statSync(srcPath);

    if (entryStat.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      withFileRetry(() => fs.copyFileSync(srcPath, destPath));
    }
  }
}
