import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { computeAdjustedColumn } from '../cmd/cursor-position';
import { getPackageJsonScripts, getTasksJsonTasks } from '../cmd/npm-run-task';

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
