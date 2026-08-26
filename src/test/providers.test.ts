import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigViewProvider } from '../views/config';
import { CommandsViewProvider } from '../views/commands';
import { FixedDataProvider } from '../views/fixed-data';
import { DepViewProvider } from '../views/node-dependencies';
import {
  registerSnapshottableProvider,
  treeViewRegistry,
  type SnapNode,
  type SnapshottableProvider
} from '../views/registry';

/**
 * @file Provider 纯逻辑测试：不经过 UI 与命令系统，
 *       直接实例化各 SnapshottableProvider 验证快照与 CRUD 行为。
 */

suite('ConfigViewProvider（配置视图）', () => {
  const fakeProperties = {
    'getCursorPosition.showMenuEntry': { type: 'boolean', default: false },
    'helloWorld.showMenuEntry': { type: 'boolean', default: false },
    'runNpmTask.npmTaskSource': { type: 'string', default: 'package.json' }
  };

  test('按前缀分组并生成两层快照', () => {
    const provider = new ConfigViewProvider(() => fakeProperties);
    const snap = provider.getSnapshot();

    // 三个前缀各成一组：getCursorPosition / helloWorld / runNpmTask
    assert.strictEqual(snap.length, 3);

    const runNpmGroup = snap.find((g) => g.label === 'runNpmTask');
    assert.ok(runNpmGroup, '缺少 runNpmTask 分组');
    assert.strictEqual(runNpmGroup.children?.length, 1);
  });

  test('叶子节点携带打开设置的命令', () => {
    const provider = new ConfigViewProvider(() => fakeProperties);
    const leaf = provider.getSnapshot()[0].children![0];
    assert.strictEqual(leaf.command?.command, 'workbench.action.openSettings');
    assert.ok(leaf.id.includes('.'));
  });

  test('refresh 后不重复累加', () => {
    let calls = 0;
    const provider = new ConfigViewProvider(() => {
      calls++;
      return fakeProperties;
    });
    provider.refresh();
    provider.refresh();
    assert.strictEqual(calls, 3, '构造 1 次 + 刷新 2 次');
    assert.strictEqual(provider.getSnapshot().length, 3, '重复刷新不应产生重复分组');
  });
});

suite('CommandsViewProvider（命令视图）', () => {
  test('按 command id 去重', () => {
    const provider = new CommandsViewProvider(() => [
      { command: 'a.cmd', title: 'A' },
      { command: 'a.cmd', title: 'A 重复声明' },
      { command: 'b.cmd', title: 'B' }
    ]);
    const snap = provider.getSnapshot();
    assert.strictEqual(snap.length, 2, '重复声明的 a.cmd 应只出现一次');
    assert.deepStrictEqual(
      snap.map((n) => n.id),
      ['a.cmd', 'b.cmd']
    );
  });

  test('节点点击即执行对应命令', () => {
    const provider = new CommandsViewProvider(() => [{ command: 'x.y', title: 'X' }]);
    assert.deepStrictEqual(provider.getSnapshot()[0].command, { command: 'x.y' });
  });
});

suite('FixedDataProvider（固定数据 CRUD）', () => {
  let provider: FixedDataProvider;

  setup(() => {
    provider = new FixedDataProvider();
  });

  test('初始种子数据为 3 个根节点', () => {
    const snap = provider.getSnapshot();
    assert.strictEqual(snap.length, 3);
    assert.strictEqual(snap[0].label, 'Category 1');
    assert.strictEqual(snap[0].children!.length, 2);
  });

  test('add：可追加根级与子级节点', () => {
    const snap0 = provider.getSnapshot();

    provider.applyAction({ kind: 'add', parentId: null, label: 'New Root' });
    let snap = provider.getSnapshot();
    assert.strictEqual(snap.length, 4);
    assert.strictEqual(snap[3].label, 'New Root');

    // 追加子级到第一个分组
    provider.applyAction({ kind: 'add', parentId: snap0[0].id, label: 'Item 1.3' });
    snap = provider.getSnapshot();
    assert.strictEqual(snap[0].children!.length, 3);

    const added = snap[0].children![2];
    assert.strictEqual(added.label, 'Item 1.3');
    // 新增节点的 id 可用于后续定位（CRUD 回传契约）
    assert.ok(added.id.startsWith('fd-'));
  });

  test('edit：按 id 改名且不影响兄弟节点', () => {
    const simpleItemId = provider.getSnapshot()[2].id;
    provider.applyAction({ kind: 'edit', id: simpleItemId, label: 'Renamed' });

    const snap = provider.getSnapshot();
    // 实现为"重建节点"语义：改名后分配新 id（契约仅要求单次快照内稳定，webview 会以新快照刷新）
    assert.strictEqual(snap[2].label, 'Renamed');
    assert.notStrictEqual(snap[2].id, simpleItemId, '重建后应分配新 id');
    assert.strictEqual(snap[1].label, 'Category 2', '不应影响其他节点');
  });

  test('delete：删除后节点消失；删空父节点后父降级为叶子', () => {
    const snap0 = provider.getSnapshot();
    const category1Id = snap0[0].id;
    const childIds = snap0[0].children!.map((c) => c.id);

    for (const id of childIds) {
      provider.applyAction({ kind: 'delete', id });
    }
    const snap = provider.getSnapshot();
    // 子列表删空后父降级为叶子（children 为空数组或缺省均可）
    assert.ok(!snap[0].children || snap[0].children.length === 0, '子列表删空后不应再有子节点');
    assert.strictEqual(snap[0].icon, 'item');

    // 删除整个分组（注意：降级时父节点被重建、id 已更换，需用最新快照的 id）
    const currentCategoryId = provider.getSnapshot()[0].id;
    provider.applyAction({ kind: 'delete', id: currentCategoryId });
    assert.strictEqual(provider.getSnapshot().length, 2);
  });

  test('对不存在的 id 操作是安全的空操作', () => {
    provider.applyAction({ kind: 'edit', id: 'fd-not-exist', label: 'X' });
    provider.applyAction({ kind: 'delete', id: 'fd-not-exist' });
    provider.applyAction({ kind: 'add', parentId: 'fd-not-exist', label: 'X' });
    assert.strictEqual(provider.getSnapshot().length, 3, '非法操作不应改变树结构');
  });
});

suite('DepViewProvider（依赖树）', () => {
  let depFixtureRoot: string;

  setup(() => {
    // 自建临时夹具：不与其他套件共享 demo-workspace，避免相互污染
    depFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vssm-dep-'));
    fs.writeFileSync(
      path.join(depFixtureRoot, 'package.json'),
      JSON.stringify({ name: 'dep-fixture', dependencies: { 'left-pad': '^1.3.0' } })
    );
  });

  teardown(() => {
    fs.rmSync(depFixtureRoot, { recursive: true, force: true });
  });

  test('未安装的依赖生成为带 openPackageOnNpm 命令的叶子', () => {
    const provider = new DepViewProvider(depFixtureRoot);
    const snap = provider.getSnapshot();

    const labels = snap.map((n) => n.label);
    assert.ok(labels.includes('left-pad'));

    const leftPad = snap.find((n) => n.label === 'left-pad')!;
    assert.strictEqual(leftPad.collapsibleState, 'none', '夹具未安装依赖应为叶子');
    assert.strictEqual(leftPad.command?.command, 'vssm-tool-node-dependencies.openPackageOnNpm');
    assert.match(leftPad.description!, /\^1\.3\.0/);
  });

  test('无工作区时返回提示节点', () => {
    const provider = new DepViewProvider(undefined);
    const snap = provider.getSnapshot();
    assert.strictEqual(snap.length, 1);
    assert.match(snap[0].label, /No workspace open/i);
  });

  test('快照深度不超过上限（防环）', () => {
    const provider = new DepViewProvider(depFixtureRoot);
    const maxDepth = (nodes: SnapNode[]): number =>
      nodes.reduce((max, n) => Math.max(max, n.children ? 1 + maxDepth(n.children) : 1), 0);
    assert.ok(maxDepth(provider.getSnapshot()) <= 3, '依赖树下钻不得超过 3 层');
  });
});

suite('registry（provider 注册表）', () => {
  test('注册后可按 viewId 查询', () => {
    const fake: SnapshottableProvider = {
      viewId: 'test-fake-provider',
      getSnapshot(): SnapNode[] {
        return [];
      }
    };
    registerSnapshottableProvider(fake);
    try {
      assert.strictEqual(treeViewRegistry.get('test-fake-provider'), fake);
    } finally {
      // 全局表，测试后清理避免污染其他用例
      treeViewRegistry.delete('test-fake-provider');
    }
  });
});
