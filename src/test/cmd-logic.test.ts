import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { computeAdjustedColumn } from '../cmd/cursor-position';
import { getPackageJsonScripts, getTasksJsonTasks } from '../cmd/npm-run-task';
import {
  applyLatestVersions,
  mergePackageJsonTemplate,
  pickLatestWithinMajor,
  refreshDevDependencyVersions
} from '../helpers/npmRegistry';

/**
 * @file 命令纯逻辑单元测试：不依赖打开的工作区与 UI，
 *       用临时目录/纯数据直接驱动从命令模块中导出的可测函数。
 */

/** @brief 构造最小 WorkspaceFolder 形状（仅用到 uri.fsPath） */
function fakeFolder(fsPath: string): vscode.WorkspaceFolder {
  return { uri: vscode.Uri.file(fsPath), name: path.basename(fsPath), index: 0 };
}

suite('computeAdjustedColumn（光标列换算）', () => {
  test('无 tab 时逐字符累加', () => {
    assert.strictEqual(computeAdjustedColumn('abc', 2, 4), 2);
    assert.strictEqual(computeAdjustedColumn('abc', 0, 4), 0);
  });

  test('tab 展开到下一个制表位（tabSize=4）', () => {
    // "a\tb"：a 占 1 列，tab 从第 1 列展开到第 4 列
    assert.strictEqual(computeAdjustedColumn('a\tb', 2, 4), 4);
    // 光标停在 tab 上（character 指向 tab 本身）
    assert.strictEqual(computeAdjustedColumn('a\tb', 1, 4), 1);
  });

  test('连续 tab 与混合缩进', () => {
    // "\t\tX"：两个 tab 各展开到 4、8 列
    assert.strictEqual(computeAdjustedColumn('\t\tX', 2, 4), 8);
    // "  \tX"：2 空格 + tab 补齐到 4 列
    assert.strictEqual(computeAdjustedColumn('  \tX', 3, 4), 4);
  });

  test('tabSize=8 的对齐', () => {
    assert.strictEqual(computeAdjustedColumn('\tX', 1, 8), 8);
    assert.strictEqual(computeAdjustedColumn('       \tX', 8, 8), 8); // 7 空格 + tab → 第 8 列
  });
});

suite('getPackageJsonScripts（npm 脚本读取）', () => {
  let tmpRoot: string;

  setup(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vssm-npm-'));
  });

  teardown(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('解析 scripts 字段为选择项', async () => {
    fs.writeFileSync(
      path.join(tmpRoot, 'package.json'),
      JSON.stringify({ scripts: { build: 'tsc', 'test:unit': 'mocha' } })
    );

    const items = await getPackageJsonScripts([fakeFolder(tmpRoot)]);
    assert.deepStrictEqual(
      items.map((i) => ({ label: i.label, description: i.description })),
      [
        { label: 'build', description: 'npm run build' },
        { label: 'test:unit', description: 'npm run test:unit' }
      ]
    );
  });

  test('无 scripts 字段时返回空数组', async () => {
    fs.writeFileSync(path.join(tmpRoot, 'package.json'), JSON.stringify({ name: 'x' }));
    assert.deepStrictEqual(await getPackageJsonScripts([fakeFolder(tmpRoot)]), []);
  });

  test('package.json 缺失时抛出明确错误', async () => {
    await assert.rejects(getPackageJsonScripts([fakeFolder(tmpRoot)]), /package\.json not found/);
  });
});

suite('getTasksJsonTasks（tasks.json 任务读取）', () => {
  let tmpRoot: string;

  setup(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vssm-tasks-'));
  });

  teardown(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('剥离注释后仅保留 npm 任务与复合任务', async () => {
    const tasksJson = [
      '{',
      '  // 单行注释应被剥离',
      '  "tasks": [',
      '    {"label": "build", "type": "npm", "script": "build"},',
      '    /* 块注释 */',
      '    {"label": "docs", "type": "shell", "command": "echo docs"},',
      '    {"label": "all", "type": "shell", "dependsOn": ["build", "docs"]}',
      '  ]',
      '}'
    ].join('\n');
    fs.mkdirSync(path.join(tmpRoot, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, '.vscode', 'tasks.json'), tasksJson);

    const items = await getTasksJsonTasks([fakeFolder(tmpRoot)]);
    // "docs" 既非 npm 也无 dependsOn，应被过滤
    assert.deepStrictEqual(
      items.map((i) => i.label),
      ['build', 'all']
    );
    const composite = items.find((i) => i.label === 'all')!;
    assert.strictEqual(composite.description, '', '复合任务无 script 时描述为空');
  });

  test('tasks.json 缺失时抛出明确错误', async () => {
    await assert.rejects(getTasksJsonTasks([fakeFolder(tmpRoot)]), /tasks\.json not found/);
  });
});

suite('refreshDevDependencyVersions（依赖版本刷新）', () => {
  let tmpRoot: string;
  let pkgPath: string;

  const BASE_MANIFEST = {
    name: 'x',
    devDependencies: { typescript: '^5.0.0', eslint: '^9.0.0', 'left-pad': '^1.3.0' }
  };

  setup(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vssm-registry-'));
    pkgPath = path.join(tmpRoot, 'package.json');
  });

  teardown(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeManifest(): void {
    fs.writeFileSync(pkgPath, JSON.stringify(BASE_MANIFEST));
  }

  test('全部查询成功：以 caret 范围写回最新版本', async () => {
    writeManifest();
    const fetcher = async (name: string) => ({ typescript: '7.0.2', eslint: '10.9.1', 'left-pad': '1.3.0' })[name];

    const { updated, total } = await refreshDevDependencyVersions(pkgPath, fetcher);

    assert.strictEqual(total, 3);
    assert.strictEqual(updated, 3);
    const manifest = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    assert.deepStrictEqual(manifest.devDependencies, {
      typescript: '^7.0.2',
      eslint: '^10.9.1',
      'left-pad': '^1.3.0'
    });
    // name 等其他字段不受影响
    assert.strictEqual(manifest.name, 'x');
  });

  test('查询失败：保留原版本范围且文件不被改写', async () => {
    writeManifest();
    const before = fs.readFileSync(pkgPath, 'utf-8');
    const fetcher = async () => undefined;

    const { updated, total } = await refreshDevDependencyVersions(pkgPath, fetcher);

    assert.strictEqual(total, 3);
    assert.strictEqual(updated, 0);
    assert.strictEqual(fs.readFileSync(pkgPath, 'utf-8'), before, '无更新时文件应保持原样');
  });

  test('部分失败：仅刷新成功项', async () => {
    writeManifest();
    const fetcher = async (name: string) => (name === 'typescript' ? '7.0.2' : undefined);

    const { updated, total } = await refreshDevDependencyVersions(pkgPath, fetcher);

    assert.strictEqual(updated, 1);
    const manifest = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    assert.strictEqual(manifest.devDependencies.typescript, '^7.0.2');
    assert.strictEqual(manifest.devDependencies.eslint, '^9.0.0');
  });

  test('applyLatestVersions：不在 devDependencies 中的包名被忽略', () => {
    const manifest = { devDependencies: { a: '^1.0.0' } };
    const updated = applyLatestVersions(manifest, { a: '2.0.0', unknown: '3.0.0' });
    assert.strictEqual(updated, 1);
    assert.strictEqual(manifest.devDependencies.a, '^2.0.0');
    assert.ok(!('unknown' in manifest.devDependencies));
  });
});

suite('mergePackageJsonTemplate（package.json 字段合并）', () => {
  let tmpRoot: string;
  let templatePath: string;
  let targetPath: string;

  const TEMPLATE_MANIFEST = {
    name: '@smai-kit/npm-package',
    version: '0.0.0',
    type: 'module',
    main: 'out/index.js',
    license: 'MIT',
    scripts: { compile: 'tsc -p ./', 'format:check': 'prettier src --check' },
    devDependencies: { typescript: '^7.0.2', eslint: '^10.9.1' }
  };

  setup(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vssm-merge-'));
    templatePath = path.join(tmpRoot, 'template.package.json');
    targetPath = path.join(tmpRoot, 'package.json');
    fs.writeFileSync(templatePath, JSON.stringify(TEMPLATE_MANIFEST));
  });

  teardown(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('缺失字段补入，已有字段保持用户原值', () => {
    // 用户已有 name/version/test 脚本/自己的依赖版本
    fs.writeFileSync(
      targetPath,
      JSON.stringify({
        name: '@smai-kit/my-pkg',
        version: '3.1.4',
        description: 'mine',
        scripts: { test: 'node --test', compile: '自定义编译命令' },
        devDependencies: { typescript: '^4.9.5' }
      })
    );

    const r = mergePackageJsonTemplate(templatePath, targetPath);
    const merged = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));

    // 已有：保持不变
    assert.strictEqual(merged.name, '@smai-kit/my-pkg');
    assert.strictEqual(merged.version, '3.1.4');
    assert.strictEqual(merged.description, 'mine');
    assert.strictEqual(merged.scripts.test, 'node --test');
    assert.strictEqual(merged.scripts.compile, '自定义编译命令', '已有脚本不应被模板覆盖');
    assert.strictEqual(merged.devDependencies.typescript, '^4.9.5', '已有依赖版本不应被覆盖');

    // 缺失：补入
    assert.strictEqual(r.addedTopLevelFields.sort().join(','), 'license,main,type');
    assert.deepStrictEqual(r.addedScripts.sort(), ['format:check']);
    assert.deepStrictEqual(r.addedDevDependencies.sort(), ['eslint']);
    assert.strictEqual(merged.type, 'module');
    assert.strictEqual(merged.main, 'out/index.js');
    assert.strictEqual(merged.license, 'MIT');
    assert.strictEqual(merged.scripts['format:check'], 'prettier src --check');
    assert.strictEqual(merged.devDependencies.eslint, '^10.9.1');
    assert.ok(r.changed);
  });

  test('目标与模板完全一致时 changed=false 且不写文件', () => {
    fs.writeFileSync(targetPath, JSON.stringify(TEMPLATE_MANIFEST));
    const before = fs.readFileSync(targetPath, 'utf-8');

    const r = mergePackageJsonTemplate(templatePath, targetPath);

    assert.ok(!r.changed);
    assert.strictEqual(fs.readFileSync(targetPath, 'utf-8'), before);
  });
});

suite('pickLatestWithinMajor（大版本内最新版挑选）', () => {
  const versions = {
    '5.9.3': {},
    '5.9.2': {},
    '5.10.0-beta.1': {},
    '7.0.2': {},
    '4.9.5': {}
  };

  test('返回指定大版本的最新稳定版', () => {
    assert.strictEqual(pickLatestWithinMajor(versions, 5), '5.9.3');
    assert.strictEqual(pickLatestWithinMajor(versions, 7), '7.0.2');
    assert.strictEqual(pickLatestWithinMajor(versions, 4), '4.9.5');
  });

  test('预发布版本不参与挑选', () => {
    const onlyPrerelease = { '6.1.0-next.1': {}, '6.0.0': {} };
    assert.strictEqual(pickLatestWithinMajor(onlyPrerelease, 6), '6.0.0');
  });

  test('大版本不存在时返回 undefined', () => {
    assert.strictEqual(pickLatestWithinMajor(versions, 3), undefined);
  });
});
