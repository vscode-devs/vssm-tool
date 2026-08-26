import * as fs from 'fs';

/**
 * @file npm registry 查询工具：初始化工程模板时把 devDependencies 刷新为当时最新版本。
 */

/** @brief 单次查询超时毫秒数 */
const REGISTRY_TIMEOUT_MS = 5000;

/**
 * @brief 从 npm registry 查询包的最新版本
 * @param packageName 包名（支持 @scope/name）
 * @returns 最新版本号；网络失败或响应异常时返回 undefined
 */
export async function fetchLatestNpmVersion(packageName: string): Promise<string | undefined> {
  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
    const response = await fetch(url, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) });
    if (!response.ok) {
      return undefined;
    }
    const data = (await response.json()) as { version?: unknown };
    return typeof data.version === 'string' ? data.version : undefined;
  } catch {
    // 离线/超时等场景静默降级，由调用方决定提示
    return undefined;
  }
}

/**
 * @brief 从 registry 返回的版本集合中挑选指定大版本内的最新稳定版（纯函数）
 * @param versions packument 的 versions 对象（键为版本号）
 * @param major 大版本号上限
 * @returns 最新稳定版本号；该大版本不存在时返回 undefined
 */
export function pickLatestWithinMajor(versions: Record<string, unknown>, major: number): string | undefined {
  const stable = Object.keys(versions)
    .filter((v) => !v.includes('-'))
    .map((v) => {
      const [maj, min = 0, pat = 0] = v.split('.').map(Number);
      return { v, parts: [maj, min, pat] };
    })
    .filter(({ parts }) => parts[0] === major);
  if (stable.length === 0) {
    return undefined;
  }
  stable.sort((a, b) => b.parts[0] - a.parts[0] || b.parts[1] - a.parts[1] || b.parts[2] - a.parts[2]);
  return stable[0].v;
}

/**
 * @brief 查询指定大版本内的最新稳定版本
 * @details 拉取完整 packument 后在客户端按大版本过滤。适用于存在 peer 约束、
 *          不能盲目取 dist-tag latest 的包（如 typescript 相对 typescript-eslint 的兼容窗口）。
 * @param packageName 包名
 * @param major 大版本号
 * @returns 版本号；网络失败或无匹配时返回 undefined
 */
export async function fetchLatestNpmVersionInMajor(packageName: string, major: number): Promise<string | undefined> {
  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) });
    if (!response.ok) {
      return undefined;
    }
    const packument = (await response.json()) as { versions?: Record<string, unknown> };
    if (!packument.versions) {
      return undefined;
    }
    return pickLatestWithinMajor(packument.versions, major);
  } catch {
    return undefined;
  }
}

/**
 * @brief 把解析到的最新版本合并进 manifest 的 devDependencies（纯函数）
 * @param manifest 包清单对象（原地修改其 devDependencies 字段）
 * @param resolvedVersions 包名 → 最新版本；未获取到的包保持原值
 * @returns 实际更新的依赖数量
 */
export function applyLatestVersions(
  manifest: { devDependencies?: Record<string, string> },
  resolvedVersions: Record<string, string | undefined>
): number {
  const deps = manifest.devDependencies ?? {};
  let updated = 0;
  for (const [name, version] of Object.entries(resolvedVersions)) {
    if (version && name in deps) {
      deps[name] = `^${version}`;
      updated++;
    }
  }
  return updated;
}

/**
 * @brief 刷新 package.json 中全部 devDependencies 为当前最新版本
 * @details 逐个并行查询 registry，成功者以 caret 范围（^x.y.z）写回；
 *          失败的包保留原版本范围，文件内容不做无谓改动。
 * @param packageJsonPath 目标 package.json 绝对路径
 * @param fetcher 版本查询函数（默认走 npm registry；可注入替身用于测试）
 * @param onlyNames 可选白名单：仅刷新这些依赖（用于合并场景保护用户已有依赖）
 * @returns updated 成功刷新的数量；total 尝试的依赖总数
 */
export async function refreshDevDependencyVersions(
  packageJsonPath: string,
  fetcher: (name: string) => Promise<string | undefined> = fetchLatestNpmVersion,
  onlyNames?: ReadonlySet<string>
): Promise<{ updated: number; total: number }> {
  const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const names = Object.keys(manifest.devDependencies ?? {}).filter((n) => !onlyNames || onlyNames.has(n));
  if (names.length === 0) {
    return { updated: 0, total: 0 };
  }

  const results = await Promise.all(names.map((n) => fetcher(n)));
  const resolved: Record<string, string | undefined> = {};
  names.forEach((n, i) => {
    resolved[n] = results[i];
  });

  const updated = applyLatestVersions(manifest, resolved);
  if (updated > 0) {
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return { updated, total: names.length };
}

/** @brief 需要按键深合并的清单段落（其余顶层字段整块"缺则补、有不覆"） */
const MERGED_SECTIONS = new Set(['scripts', 'devDependencies']);

/**
 * @brief 检查合并 package.json 模板字段
 * @details 合并语义："缺少的就添加进去，已有的保持不变"——
 *          - scripts / devDependencies 按键合并：目标缺失的键补入，已有键保持原值；
 *          - 其余顶层字段（type/main/exports/license 等）目标缺失时整块补入；
 *          - 目标已存在的任何字段值都不会被覆盖。
 *          注意：写回会对整个文件做 2 空格缩进的格式化。
 * @param templatePath 模板 package.json 路径
 * @param targetPath 目标 package.json 路径
 * @returns 合并结果；changed 为 false 时未写回文件
 */
/** @brief 合并结果：各维度新增的键列表与是否发生了变更 */
export interface PackageJsonMergeResult {
  addedTopLevelFields: string[];
  addedScripts: string[];
  addedDevDependencies: string[];
  changed: boolean;
}

export function mergePackageJsonTemplate(templatePath: string, targetPath: string): PackageJsonMergeResult {
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
  const target = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));

  const result: PackageJsonMergeResult = {
    addedTopLevelFields: [],
    addedScripts: [],
    addedDevDependencies: [],
    changed: false
  };

  for (const [key, templateValue] of Object.entries(template)) {
    if (key === 'name' || key === 'version') {
      // 标识类字段属于用户资产，即使缺失也由用户自行决定，不代填
      continue;
    }

    const exists = Object.prototype.hasOwnProperty.call(target, key);
    if (!exists && !MERGED_SECTIONS.has(key)) {
      target[key] = structuredClone(templateValue);
      result.addedTopLevelFields.push(key);
      continue;
    }

    if (exists && MERGED_SECTIONS.has(key)) {
      // 按键合并：只补缺失键
      const sectionKey = key === 'scripts' ? 'addedScripts' : 'addedDevDependencies';
      const targetSection = (target[key] ?? {}) as Record<string, unknown>;
      for (const [subKey, subValue] of Object.entries(templateValue as Record<string, unknown>)) {
        if (!Object.prototype.hasOwnProperty.call(targetSection, subKey)) {
          targetSection[subKey] = subValue;
          result[sectionKey].push(subKey);
        }
      }
      target[key] = targetSection;
      continue;
    }
  }

  result.changed =
    result.addedTopLevelFields.length > 0 || result.addedScripts.length > 0 || result.addedDevDependencies.length > 0;

  if (result.changed) {
    fs.writeFileSync(targetPath, `${JSON.stringify(target, null, 2)}\n`);
  }
  return result;
}
