/**
 * @file 包入口
 * @details ESM 项目：使用 import/export 语法，构建产物输出到 out/ 目录。
 *          以 node 直接运行产物（如 node out/index.js）时会打印问候语；
 *          被其他模块导入时仅提供导出 API，不产生副作用。
 */

import { pathToFileURL } from 'node:url';

/**
 * @brief 问候选项
 */
export interface GreetOptions {
  /** @brief 称呼前缀，默认 'Hello' */
  prefix?: string;
}

/**
 * @brief 向指定名称问好
 * @param name 名称
 * @param options 可选配置
 * @returns 拼接后的问候语
 */
export function greet(name: string, options: GreetOptions = {}): string {
  const prefix = options.prefix ?? 'Hello';
  return `${prefix}, ${name}!`;
}

// ESM 入口判定：仅在被直接运行时执行演示调用，被导入时跳过
const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  console.log(greet('world'));
}
