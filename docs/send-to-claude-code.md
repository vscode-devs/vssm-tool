## 一、 需求背景

### 1. 功能目标

在 VS Code 中选中代码后，将选区内容（包含文件路径、行号范围、语言标识等上下文）一键发送到当前 VS Code 集成终端中正在运行的 Claude Code CLI 输入区域，供 Claude 直接理解和分析代码。

但其实，只要装了claude code for vscode 扩展，我们直接在编辑器选择代码，不需要做任何操作，它就自动会和此次提问一起作为上问传递给大模型，当然，前提是要装这个扩展，一般这个扩展在安装claude的时候会强制自动安装，但是code-server不会，它会提示失败，好像是因为内部安装的时候调用的是code命令。

### 2. 参考来源

参考了 Claude Code VS Code 扩展的选区上下文机制。Claude Code 扩展通过 4 层架构实现选区感知：

- 监听 `onDidChangeTextEditorSelection` 事件捕获选区变化
- 通过 Webview 的 `postMessage` 更新输入框下方的选区信息 UI
- 本地 IDE MCP Server 缓存选区状态，供 CLI 读取
- CLI 在提交 prompt 时将选区格式化后注入到 LLM 对话上下文

本功能不依赖 Claude Code 扩展或 MCP 协议，而是直接对接 `claude` CLI 终端，通过剪贴板 + 粘贴的方式将格式化的选区内容输入到 CLI 的交互界面。

## 二、 整体架构

### 1. 模块组成

功能由一个核心文件 `src/cmd/send-to-claude.ts` 承载，在 `src/extension.ts` 中注册，通过 `package.json` 声明命令、快捷键和菜单。

```
用户触发 (Ctrl+Alt+C / 右键菜单 / 命令面板)
        ↓
extension.ts → commands.sendToClaudeCode.register
        ↓
send-to-claude.ts → handleSendToClaudeCode()
        ↓
    ┌── isClaudeCliAvailable()    → CLI 可用性检查
    ├── buildPrompt()             → 选区信息格式化
    └── sendToClaudeTerminal()    → 终端查找 + 粘贴
            ├── findClaudeTerminal()  → 进程树检测
            └── workbench.action.terminal.paste
```

### 2. 注册模式

遵循 vssm-tool 扩展的统一声明式注册模式。在 `extension.ts` 的 `commands` 对象中添加条目：

```typescript
// extension.ts
import { registerSendToClaudeCodeCommand } from './cmd/send-to-claude';

const commands = {
  // ... 其他命令
  sendToClaudeCode: {
    register: registerSendToClaudeCodeCommand,
    enabled: true
  }
};
```

注册函数签名约定：`(context: vscode.ExtensionContext) => string`，返回注册的命令 ID 字符串。`tryRegister` 机制自动防重复注册。

### 3. 命令声明

在 `package.json` 的 `contributes` 中声明了命令、快捷键和菜单入口：

```json
// 命令声明
{ "command": "vssm-tool.sendToClaudeCode", "title": "Send Selection to Claude Code", "icon": "$(send)" }

// 快捷键绑定（仅在有选区时生效）
{ "command": "vssm-tool.sendToClaudeCode", "key": "ctrl+alt+c", "mac": "cmd+alt+c", "when": "editorHasSelection" }

// 右键菜单（VSSM Tool 子菜单下，仅在有选区时可见）
{ "command": "vssm-tool.sendToClaudeCode", "group": "1_commands@4", "when": "editorHasSelection" }
```

## 三、 实现逻辑详解

### 1. 命令入口 — `handleSendToClaudeCode()`

这是整个功能的入口函数，由 VS Code 命令系统在用户触发 `vssm-tool.sendToClaudeCode` 时调用。执行流程：

```typescript
async function handleSendToClaudeCode(): Promise<void> {
  // 第一步：获取活动编辑器
  const editor = vscode.window.activeTextEditor;
  if (!editor) { /* 提示：没有活动的编辑器 */ return; }

  // 第二步：检查选区是否为空
  const selection = editor.selection;
  if (selection.isEmpty) { /* 提示：请先选中代码 */ return; }

  // 第三步：检查 claude CLI 是否可用
  if (!isClaudeCliAvailable()) { /* 提示安装 */ return; }

  // 第四步：提取选区元数据
  const document = editor.document;
  const startLine = selection.start.line + 1;  // VS Code 行号 0-based，转为 1-based
  const endLine = selection.end.line + 1;
  const selectedText = document.getText(selection);

  // 第五步：计算相对于工作区根目录的文件路径
  const workspaceFolders = vscode.workspace.workspaceFolders;
  let filePath = document.uri.fsPath;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    if (filePath.startsWith(workspaceRoot)) {
      filePath = path.relative(workspaceRoot, filePath);
    }
  }

  // 第六步：格式化并发送
  const languageId = document.languageId;
  const prompt = buildPrompt(filePath, startLine, endLine, languageId, selectedText);
  await sendToClaudeTerminal(prompt);
}
```

关键点：

- 行号转换：VS Code 内部使用 0-based 行号，展示给用户时需要 `+1` 转为 1-based
- 相对路径：使用 `path.relative()` 将绝对路径转为相对于工作区根目录的路径，使输出更简洁
- `document.languageId` 由 VS Code 根据文件扩展名和语言服务自动识别

### 2. 选区格式化 — `buildPrompt()` 与 `formatCodeWithLineNumbers()`

将原始选区信息转换为结构化的文本，供 Claude 理解代码上下文。

#### 2.1 `formatCodeWithLineNumbers()`

将代码文本的每一行添加行号前缀，行号右对齐，宽度由最大行号决定：

```typescript
function formatCodeWithLineNumbers(text: string, startLine: number): string {
  const lines = text.split('\n');
  const maxLineNum = startLine + lines.length - 1;
  const width = String(maxLineNum).length;  // 行号列宽

  return lines.map((line, i) => {
    const num = String(startLine + i).padStart(width, ' ');
    return `${num} | ${line}`;
  }).join('\n');
}
```

输出效果：

```
42 | function parseConfig(raw: string): Config {
43 |   const lines = raw.split('\n');
44 |   const config = new Config();
```

#### 2.2 `buildPrompt()`

将文件头信息和格式化的代码块拼接为最终 prompt：

```typescript
function buildPrompt(filePath, startLine, endLine, languageId, selectedText): string {
  const lineCount = endLine - startLine + 1;
  const header = `${filePath} L${startLine}-${endLine} (${lineCount} 行, ${languageId})`;
  const codeBlock = formatCodeWithLineNumbers(selectedText, startLine);

  return `${header}\n\n\`\`\`${languageId}\n${codeBlock}\n\`\`\``;
}
```

最终输出格式：

````
src/extension.ts L42-L67 (26 行, typescript)

```typescript
42 | function parseConfig(raw: string): Config {
43 |   const lines = raw.split('\n');
44 |   // ...
```
````

### 3. CLI 可用性检测 — `isClaudeCliAvailable()`

通过 `which`（Linux/macOS）或 `where`（Windows）命令检测 `claude` 是否在系统 PATH 中：

```typescript
function isClaudeCliAvailable(): boolean {
  try {
    cp.execSync('which claude 2>/dev/null || where claude 2>nul', { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}
```

使用 `2>/dev/null` / `2>nul` 抑制错误输出，如果命令执行失败（`claude` 不存在）则 `execSync` 抛出异常，`catch` 捕获后返回 `false`。

### 4. 终端检测 — `findClaudeTerminal()`

这是功能中最关键的部分，负责在所有 VS Code 集成终端中找到正在运行 `claude` 的那个。

#### 4.1 第一层：自建终端查找

```typescript
const named = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
if (named) { return named; }
```

当本功能新建终端时，会将其命名为 `"Claude Code"`。如果这个终端还存活，直接复用。

#### 4.2 第二层：进程树检测

当用户手动在某个 bash/zsh 终端中运行 `claude` 时，终端名称不会改变，需要通过进程关系来判断。

**步骤一：收集所有终端的 shell PID**

```typescript
const pidToTerminal = new Map<number, vscode.Terminal>();
const shellPids = new Set<number>();
for (const t of vscode.window.terminals) {
  const pid = await t.processId;  // 返回终端 shell 进程的 PID
  if (pid) {
    pidToTerminal.set(pid, t);
    shellPids.add(pid);
  }
}
```

`terminal.processId` 返回的是终端 shell（如 bash、zsh）的进程 ID，不是 `claude` 的 PID。

**步骤二：构建系统进程树**

```typescript
const psOutput = cp.execSync('ps -eo pid,ppid,comm', { encoding: 'utf-8', timeout: 3000 });
```

`ps -eo pid,ppid,comm` 输出所有进程的 PID、父 PID 和命令名，形如：

```
  PID  PPID COMM
 1234  1000 bash
 5678  1234 claude
```

解析后构建两个映射表：

- `ppidOf`：`Map<pid, ppid>` — 每个进程的父进程 ID
- `commOf`：`Map<pid, comm>` — 每个进程的命令名

**步骤三：沿 ppid 链向上追溯**

```typescript
for (const [pid, comm] of commOf) {
  if (!comm.includes('claude')) { continue; }  // 只关注 claude 进程

  let cur = ppidOf.get(pid);  // claude 的父进程
  const visited = new Set<number>();  // 防止环路
  while (cur && !visited.has(cur)) {
    if (shellPids.has(cur)) {
      // 找到了：claude 的某个祖先进程是某个终端的 shell
      return pidToTerminal.get(cur);
    }
    visited.add(cur);
    cur = ppidOf.get(cur);  // 继续向上追溯
  }
}
```

核心思路：对每个 `claude` 进程，沿父进程链逐级向上查找，如果链路上存在某个 PID 等于某个终端的 shell PID，则说明该终端正在运行 `claude`。

进程关系示意：

```
终端 shell (PID 1234) ← terminal.processId 返回此 PID
  └── claude (PID 5678) ← comm 包含 "claude"
       └── node (PID 9012) ← claude 内部子进程
```

`visited` 集合防止进程树中出现环路导致死循环（如 PID 0 的 ppid 指向自身）。

**兼容性**：`ps` 命令仅在 Linux/macOS 上可用。Windows 上会进入 `catch` 分支静默跳过，退化为仅检查自建终端。

### 5. 终端交互 — `sendToClaudeTerminal()`

将格式化好的 prompt 内容输入到 Claude Code CLI 终端。

#### 5.1 已有 claude 终端的处理

```typescript
await vscode.env.clipboard.writeText(prompt);   // 写入剪贴板
terminal.show(true);                             // 聚焦终端（不抢占焦点）
await new Promise((resolve) => setTimeout(resolve, 100));  // 等待终端获得焦点
await vscode.commands.executeCommand('workbench.action.terminal.paste');  // 触发粘贴
```

使用 VS Code 内置的 `workbench.action.terminal.paste` 命令而非 `terminal.sendText()`，原因：

- `terminal.sendText(text)` 会将文本逐字符发送到终端，对多行文本可能触发意外的换行提交
- `workbench.action.terminal.paste` 模拟用户 Ctrl+V 操作，Claude Code CLI 的输入区域能正确接收多行粘贴内容

100ms 延迟确保 `terminal.show(true)` 完成终端聚焦后再执行粘贴。

#### 5.2 无 claude 终端的处理

```typescript
const newTerminal = vscode.window.createTerminal(TERMINAL_NAME);
newTerminal.show(true);
newTerminal.sendText('claude');  // 在终端中执行 claude 命令
```

新建一个名为 `"Claude Code"` 的终端并启动 `claude`。由于 `claude` 启动需要数秒，无法立即粘贴，因此将内容写入剪贴板并提示用户手动 Ctrl+V 粘贴。下次触发时，`findClaudeTerminal()` 会通过自建终端名称找到该终端，实现自动粘贴。

### 6. 命令注册 — `registerSendToClaudeCodeCommand()`

```typescript
export function registerSendToClaudeCodeCommand(context: vscode.ExtensionContext): string {
  const commandName = 'vssm-tool.sendToClaudeCode';
  const disposable = vscode.commands.registerCommand(commandName, handleSendToClaudeCode);
  context.subscriptions.push(disposable);  // 注册到扩展生命周期，自动清理
  return commandName;  // 返回命令名称，供 tryRegister 追踪
}
```

遵循 vssm-tool 扩展的注册约定：

- 返回命令 ID 字符串（`tryRegister` 将其加入 `registeredCommands` 集合防重复）
- `context.subscriptions.push()` 确保扩展停用时自动释放资源
- `enabled: true` 控制是否参与注册

## 四、 遇到的问题与解决

### 1. URI Handler 打开新窗口

- **现象**：使用 `vscode.env.openExternal()` 调用 `vscode://anthropic.claude-code/open` URI Handler 会打开一个新的 VS Code 窗口
- **原因**：`openExternal` 将 URI 交给操作系统处理，操作系统会启动新的 VS Code 实例来响应
- **尝试**：改用 `vscode.commands.executeCommand('vscode.open', uri)` 在当前窗口内触发，但该方案依赖 Claude Code VS Code 扩展的安装
- **结论**：放弃 URI Handler 方案，改为直接对接终端中的 `claude` CLI，不依赖任何第三方扩展

### 2. 终端粘贴方式不可靠

- **现象**：`terminal.sendText('\x16')`（Ctrl+V 转义序列）导致空内容被提交到 claude，触发 API 报错
- **原因**：`\x16` 是终端的 quoted-insert 控制字符（Ctrl+V 在终端中的原始含义），不等同于粘贴操作。在不同终端模拟器中行为不一致
- **解决**：改用 `vscode.commands.executeCommand('workbench.action.terminal.paste')`，先将内容写入剪贴板，再通过 VS Code 的终端粘贴命令触发标准粘贴行为

### 3. 无法检测用户手动启动的 claude

- **现象**：用户在已有的 bash/zsh 终端中手动运行 `claude`，扩展检测不到，会重复创建新终端
- **原因**：初始实现仅通过终端名称 `"Claude Code"` 查找，而用户手动启动时终端名称仍是默认的 "bash"/"zsh"
- **解决**：引入进程树检测机制，通过 `ps -eo pid,ppid,comm` 读取系统所有进程的父子关系，对每个 `claude` 进程沿 ppid 链向上追溯，判断是否属于某个 VS Code 终端的 shell 子进程

## 五、 使用方式

1. 在编辑器中选中代码
2. 按 `Ctrl+Alt+C`（Mac: `Cmd+Alt+C`），或右键 → VSSM Tool → Send Selection to Claude Code
3. 已有 claude 终端 → 内容自动粘贴到输入区，审视后按 Enter 提交
4. 无 claude 终端 → 自动新建终端并启动 claude，内容已复制到剪贴板，就绪后 Ctrl+V 粘贴

## 六、 文件变更清单

### 1. 新增文件

| 文件 | 说明 |
|------|------|
| `src/cmd/send-to-claude.ts` | 核心命令模块，包含选区提取、格式化、CLI 检测、终端查找、粘贴交互等全部逻辑 |
| `docs/send-to-claude-code.md` | 本文档 |

### 2. 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/extension.ts` | 添加 `registerSendToClaudeCodeCommand` 的 import 和 `commands.sendToClaudeCode` 注册条目 |
| `package.json` | 添加 command 声明（`vssm-tool.sendToClaudeCode`）、keybinding（`Ctrl+Alt+C`）、右键子菜单条目 |

### 3. 删除内容

移除了不再需要的 `selectionInfoPanel` 相关内容：

- `src/cmd/selection-info-panel.ts` — 文件保留但不再注册到 commands
- `package.json` 中的 `toggleSelectionInfoPanel` / `showSelectionInfoPanel` 命令声明、菜单条目、快捷键绑定
- `src/extension.ts` 中的 `registerSelectionInfoPanelCommand` import 和 `selectionInfoPanel` commands 注册条目

---
*本文档由 markdowncli 技能辅助生成*
