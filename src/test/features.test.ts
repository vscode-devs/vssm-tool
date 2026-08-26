import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { withFileRetry } from '../helpers/utils';

/**
 * @file 命令级集成测试：在真实 Extension Host 中执行命令，
 *       通过文件系统副作用断言功能正确（黑盒，不经 UI 交互）。
 * @details 前置：npm test 的 pretest 只做 compile+lint，
 *          不执行 postbuild，故 suiteSetup 中自行把模板资源同步到 out/
 *          （与 package.json scripts.postbuild 等价的幂等拷贝）。
 */

/** @brief 夹具工作区（.vscode-test.mjs workspaceFolder 打开的目录） */
const FIXTURE_ROOT = path.join(__dirname, '..', '..', 'test-fixtures', 'demo-workspace');
/** @brief 运行时资源根目录（编译输出 out/） */
const RESOURCE_ROOT = path.join(__dirname, '..');
/** @brief 仓库源码 src 目录 */
const SRC_DIR = path.join(RESOURCE_ROOT, '..', 'src');

/**
 * @brief 同步运行时模板资源到 out/（幂等）
 * @details 与 postbuild 行为一致：DefaultTemplate.* 拷入 out/，template 树整体拷入 out/template。
 */
function ensureRuntimeResources(): void {
  fs.cpSync(path.join(SRC_DIR, 'template'), path.join(RESOURCE_ROOT, 'template'), { recursive: true });
  for (const name of fs.readdirSync(SRC_DIR)) {
    if (name.startsWith('DefaultTemplate.')) {
      fs.copyFileSync(path.join(SRC_DIR, name), path.join(RESOURCE_ROOT, name));
    }
  }
}

/** @brief 删除夹具内指定相对路径的产物（存在才删；带重试以规避 Windows 删除挂起句柄） */
function cleanFixture(...rel: string[]): void {
  for (const p of rel) {
    withFileRetry(() => fs.rmSync(path.join(FIXTURE_ROOT, p), { recursive: true, force: true }));
  }
}

/** @brief 读取夹具内文件的文本内容 */
function readFixture(relPath: string): string {
  return fs.readFileSync(path.join(FIXTURE_ROOT, relPath), 'utf-8');
}

suite('addToIgnore 命令', () => {
  const target = vscode.Uri.file(path.join(FIXTURE_ROOT, 'sample.txt'));

  setup(() => {
    cleanFixture('.gitignore', '.prettierignore', '.vscodeignore');
  });

  test('把文件追加进 .gitignore', async () => {
    await vscode.commands.executeCommand('vssm-tool.addToGitIgnore', target);

    const content = readFixture('.gitignore');
    assert.ok(content.split('\n').includes('sample.txt'), '.gitignore 应包含 sample.txt 一行');
  });

  test('重复添加不产生重复行', async () => {
    await vscode.commands.executeCommand('vssm-tool.addToGitIgnore', target);
    await vscode.commands.executeCommand('vssm-tool.addToGitIgnore', target);

    const count = readFixture('.gitignore')
      .split('\n')
      .filter((l) => l === 'sample.txt').length;
    assert.strictEqual(count, 1, '同一目标只应出现一次');
  });

  test('可写入 .prettierignore', async () => {
    await vscode.commands.executeCommand('vssm-tool.addToPrettierIgnore', target);
    assert.ok(readFixture('.prettierignore').includes('sample.txt'));
  });

  test('可写入 .vscodeignore（工厂函数第三配置）', async () => {
    await vscode.commands.executeCommand('vssm-tool.addToVScodeIgnore', target);
    assert.ok(readFixture('.vscodeignore').includes('sample.txt'));
  });
});

suite('generateConfigs 命令', () => {
  setup(() => {
    ensureRuntimeResources();
    cleanFixture('.editorconfig', '.clang-format', 'demo-workspace.code-workspace');
  });

  test('生成 .clang-format 且内容与内置模板逐字节一致', async function () {
    // 直接验证"注册时注入的模板路径指向 out/"这一契约
    await vscode.commands.executeCommand('vssm-tool.generateClangFormat', vscode.Uri.file(FIXTURE_ROOT));

    const generated = readFixture('.clang-format');
    const template = fs.readFileSync(path.join(SRC_DIR, 'DefaultTemplate.clang-format'), 'utf-8');
    assert.strictEqual(generated, template, '生成内容应与 DefaultTemplate.clang-format 完全一致');
  });

  test('生成 .editorconfig（非空）', async () => {
    await vscode.commands.executeCommand('vssm-tool.generateEditorConfig', vscode.Uri.file(FIXTURE_ROOT));
    assert.ok(readFixture('.editorconfig').length > 0);
  });

  test('按文件夹名生成 <name>.code-workspace', async () => {
    await vscode.commands.executeCommand('vssm-tool.generateWorkspaceConfig', vscode.Uri.file(FIXTURE_ROOT));
    assert.ok(readFixture('demo-workspace.code-workspace').length > 0);
  });
});

suite('initProject 命令（c-vscode）', () => {
  setup(() => {
    ensureRuntimeResources();
    // 只清理文件级产物；不删 .vscode 目录 —— 工作区正被测试宿主监视，
    // 删除后立即重建会撞上 Windows"删除挂起"句柄导致 EPERM（目录已存在时命令本就跳过）
    cleanFixture('.clang-format', '.gitignore', 'README.md');
  });

  test('初始化 C 工程模板（含特殊目标映射）', async function () {
    this.timeout(30000);
    // 双保险：执行前再次同步资源并校验前置（区分"环境资源缺失"与"命令逻辑错误"）
    ensureRuntimeResources();
    const clangTemplateSrc = path.join(RESOURCE_ROOT, 'DefaultTemplate.clang-format');
    assert.ok(fs.existsSync(clangTemplateSrc), `前置失效：运行时模板缺失 ${clangTemplateSrc}`);

    await vscode.commands.executeCommand('vssm-tool.initProject.c-vscode');

    // 失败时输出现场，便于定位（命令内部 catch 会吞掉异常细节）
    const listing = fs
      .readdirSync(FIXTURE_ROOT)
      .map((n) => (fs.statSync(path.join(FIXTURE_ROOT, n)).isDirectory() ? n + '/' : n))
      .join(', ');
    const clangFormatPath = path.join(FIXTURE_ROOT, '.clang-format');
    assert.ok(fs.existsSync(clangFormatPath), `缺少 .clang-format；initProject 执行后夹具内容: [${listing}]`);
    assert.strictEqual(
      readFixture('.clang-format'),
      fs.readFileSync(path.join(SRC_DIR, 'DefaultTemplate.clang-format'), 'utf-8'),
      '.clang-format 应来自 DefaultTemplate.clang-format'
    );
    assert.ok(fs.existsSync(path.join(FIXTURE_ROOT, 'README.md')), '缺少 README.md');
    assert.match(readFixture('README.md'), /^## README/);

    const gitignore = readFixture('.gitignore');
    const template = fs.readFileSync(path.join(SRC_DIR, 'template', 'c-vscode', 'C.gitignore'), 'utf-8');
    assert.strictEqual(gitignore, template, '.gitignore 应来自 C.gitignore 模板');

    // 常规同名拷贝：.vscode 配置目录
    assert.ok(fs.existsSync(path.join(FIXTURE_ROOT, '.vscode', 'extensions.json')));
    assert.ok(fs.existsSync(path.join(FIXTURE_ROOT, '.vscode', 'settings.json')));
  });
});

suite('initProject 命令（cnb）', () => {
  setup(() => {
    ensureRuntimeResources();
    // 清理 CNB 模板的全部目标（含目录树），保证用例从干净状态开始
    cleanFixture('.editorconfig', 'README.md', '.cnb.yml', '.cnb', 'LICENSE');
  });

  test('初始化 CNB 工程模板（含特殊目标映射）', async function () {
    this.timeout(30000);
    // 前置校验：与 c-vscode 用例同理，区分环境问题与命令逻辑错误
    const editorTemplateSrc = path.join(RESOURCE_ROOT, 'DefaultTemplate.editorconfig');
    assert.ok(fs.existsSync(editorTemplateSrc), `前置失效：运行时模板缺失 ${editorTemplateSrc}`);

    await vscode.commands.executeCommand('vssm-tool.initProject.cnb');

    // 常规同名拷贝：根文件 + .cnb 目录树（含子目录 workflows）
    assert.ok(fs.existsSync(path.join(FIXTURE_ROOT, '.cnb.yml')), '缺少 .cnb.yml');
    assert.ok(fs.existsSync(path.join(FIXTURE_ROOT, 'LICENSE')), '缺少 LICENSE');
    assert.ok(
      fs.existsSync(path.join(FIXTURE_ROOT, '.cnb', 'workflows', 'cnb-build-image.yml')),
      '缺少 .cnb/workflows 目录树拷贝'
    );

    // 特殊目标：.editorconfig / README.md 来自映射表指定的 DefaultTemplate
    assert.strictEqual(
      readFixture('.editorconfig'),
      fs.readFileSync(path.join(SRC_DIR, 'DefaultTemplate.editorconfig'), 'utf-8'),
      '.editorconfig 应来自 DefaultTemplate.editorconfig'
    );
    assert.match(readFixture('README.md'), /^## README/, 'README.md 应来自 DefaultTemplate.README.md');
  });
});

suite('initProject 命令（npm-package）', () => {
  setup(() => {
    ensureRuntimeResources();
    // 清理 npm 模板的全部目标（含 src / scripts 目录树）
    cleanFixture('package.json', 'tsconfig.json', '.prettierrc', 'eslint.config.mjs', 'src', 'scripts');
  });

  test('初始化 ESM npm 包工程模板', async function () {
    this.timeout(30000);
    await vscode.commands.executeCommand('vssm-tool.initProject.npm-package');

    // package.json：ESM 标识 + 产物入口指向 out/ + 脚本齐全
    const pkg = JSON.parse(readFixture('package.json'));
    assert.strictEqual(pkg.name, '@smai-kit/npm-package', '应使用 @smai-kit 范围名');
    assert.strictEqual(pkg.version, '0.0.0', '初始版本应为 0.0.0');
    assert.strictEqual(pkg.license, 'MIT');
    assert.strictEqual(pkg.type, 'module', '应为 ESM 项目');
    assert.strictEqual(pkg.main, 'out/index.js', '入口应指向 out 目录');
    assert.ok(pkg.scripts?.compile, '缺少 compile 脚本');
    assert.ok(pkg.scripts?.lint, '缺少 lint 脚本');
    assert.ok(pkg.scripts['git-sync-force'], '缺少 git-sync-force 脚本');
    assert.strictEqual(pkg.scripts['format:check'], 'prettier src --check', 'format 应只关注 src 目录');
    assert.strictEqual(pkg.scripts['format:fix'], 'prettier src --write');

    // tsconfig：产物输出目录必须为 out/
    const tsconfig = JSON.parse(readFixture('tsconfig.json'));
    assert.strictEqual(tsconfig.compilerOptions.outDir, 'out');

    // 工具链配置文件
    assert.ok(JSON.parse(readFixture('.prettierrc')), '.prettierrc 应为合法 JSON');
    assert.ok(fs.existsSync(path.join(FIXTURE_ROOT, 'eslint.config.mjs')), '缺少 eslint 配置');

    // 源码入口与工具脚本
    assert.ok(fs.existsSync(path.join(FIXTURE_ROOT, 'src', 'index.ts')), '缺少 src/index.ts');
    assert.ok(fs.existsSync(path.join(FIXTURE_ROOT, 'scripts', 'sync-force.mjs')), '缺少 scripts/sync-force.mjs');
  });

  test('工作区已有 package.json 时执行字段级合并（缺则补、有不覆）', async function () {
    this.timeout(30000);

    // 模拟用户已有项目：自己的名称/版本/脚本/依赖
    const userManifest = {
      name: '@smai-kit/my-lib',
      version: '2.3.3',
      scripts: { test: 'node --test', compile: '用户自定义编译' },
      devDependencies: { typescript: '^4.9.5' }
    };
    fs.writeFileSync(path.join(FIXTURE_ROOT, 'package.json'), JSON.stringify(userManifest));

    await vscode.commands.executeCommand('vssm-tool.initProject.npm-package');

    const merged = JSON.parse(readFixture('package.json'));
    // 已有：保持不变（含依赖版本）
    assert.strictEqual(merged.name, '@smai-kit/my-lib');
    assert.strictEqual(merged.version, '2.3.3');
    assert.strictEqual(merged.scripts.test, 'node --test');
    assert.strictEqual(merged.scripts.compile, '用户自定义编译');
    assert.match(merged.devDependencies.typescript, /\^?4\.9\.5/, '用户已有依赖不应被改写');
    // 缺失：补入
    assert.strictEqual(merged.type, 'module', '应补入 ESM 标识');
    assert.strictEqual(merged.scripts['format:check'], 'prettier src --check');
    assert.ok(merged.devDependencies.eslint, '应补入模板缺失的 eslint 依赖');

    // 其他模板文件正常创建
    assert.ok(fs.existsSync(path.join(FIXTURE_ROOT, 'src', 'index.ts')));
    assert.strictEqual(JSON.parse(readFixture('tsconfig.json')).compilerOptions.outDir, 'out');
  });
});
