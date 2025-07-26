import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// 配置项枚举
enum TaskSource {
  TasksJson = 'tasks.json',
  PackageJson = 'package.json'
}

/**
 * @interface NpmTaskDefinition
 * @brief npm任务定义接口
 * @extends vscode.TaskDefinition
 * @property {string} type 任务类型
 * @property {string} label 任务显示名称
 * @property {string} [script] 要运行的npm脚本
 * @property {string} [problemMatcher] 问题匹配器
 * @property {boolean} [isBackground] 是否后台运行
 * @property {Object} [presentation] 任务展示配置
 * @property {string} presentation.reveal 如何显示任务输出
 * @property {Object} [group] 任务分组配置
 * @property {string} group.kind 分组类型
 * @property {boolean} group.isDefault 是否默认任务
 */

interface NpmTaskDefinition extends vscode.TaskDefinition {
  type: string;
  label: string;
  script?: string;
  problemMatcher?: string;
  isBackground?: boolean;
  presentation?: {
    reveal: string;
  };
  group?: {
    kind: string;
    isDefault: boolean;
  };
}

/**
 * @interface TaskQuickPickItem
 * @brief 任务快速选择项接口
 * @extends vscode.QuickPickItem
 * @property {NpmTaskDefinition} task 关联的npm任务定义
 */
interface TaskQuickPickItem extends vscode.QuickPickItem {
  task: NpmTaskDefinition;
}

/**
 * @brief 获取配置中的任务来源
 * @returns {Promise<TaskSource>} 返回配置的任务来源
 */
async function getTaskSource(): Promise<TaskSource> {
  // 获取vssm-tool扩展的配置
  const config = vscode.workspace.getConfiguration('vssm-tool');
  // 从配置中获取npmTaskSource设置，默认为PackageJson
  return config.get<TaskSource>('npmTaskSource', TaskSource.PackageJson);
}

/**
 * @brief 从package.json获取npm脚本
 * @async
 * @returns {Promise<vscode.QuickPickItem[]>} 返回脚本选择项数组
 */
async function getPackageJsonScripts(workspaceFolders: readonly vscode.WorkspaceFolder[]): Promise<vscode.QuickPickItem[]> {
  // 构建package.json完整路径
  const packageJsonPath = path.join(workspaceFolders[0].uri.fsPath, 'package.json');
  // 检查文件是否存在
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json not found');
  }

  // 读取并解析package.json文件
  const fileContent = fs.readFileSync(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(fileContent);
  // 获取scripts字段，默认为空对象
  const scripts = packageJson.scripts || {};

  // 将scripts转换为QuickPickItem数组
  return Object.keys(scripts).map(name => ({
    label: name,  // 脚本名称作为标签
    description: `npm run ${name}`,  // 显示执行的命令
    // detail: `npm run ${name}`
  }));
}

/**
 * @brief 从tasks.json获取npm任务
 * @async
 * @returns {Promise<vscode.QuickPickItem[]>} 返回任务选择项数组
 */
async function getTasksJsonTasks(workspaceFolders: readonly vscode.WorkspaceFolder[]): Promise<vscode.QuickPickItem[]> {
  // 构建tasks.json完整路径
  const tasksJsonPath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'tasks.json');
  // 检查文件是否存在
  if (!fs.existsSync(tasksJsonPath)) {
    throw new Error('tasks.json not found');
  }

  // 读取并处理tasks.json文件
  const fileContent = fs.readFileSync(tasksJsonPath, 'utf-8');
  // 移除JSON注释(因为JSON标准不支持注释)
  const jsonWithoutComments = fileContent.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
  // 解析JSON内容
  const tasksJson = JSON.parse(jsonWithoutComments);
  // 获取tasks数组，默认为空数组
  const allTasks = tasksJson.tasks || [];

  // 过滤并转换任务为QuickPickItem数组
  return allTasks
    // 过滤出npm任务或有依赖项的任务
    .filter((task: NpmTaskDefinition) => task.type === 'npm' || (task.dependsOn && task.dependsOn.length > 0))
    // 转换为QuickPickItem格式
    .map((task: NpmTaskDefinition) => ({
      label: task.label,  // 任务标签
      description: task.script ? `npm run ${task.script}` : '',  // 显示执行的命令(如果有)
      task  // 关联的任务定义
    }));
}

/**
 * @brief 显示并执行npm任务/脚本
 * @details 根据配置从package.json或tasks.json获取任务，显示选择列表并执行
 * @async
 * @throws {Error} 当读取文件失败时抛出错误
 */
async function showNpmTasks() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder found');
    return;
  }

  try {
    // 获取配置的任务来源(package.json或tasks.json)
    const taskSource = await getTaskSource();
    let items: vscode.QuickPickItem[];  // 任务/脚本项数组
    let title: string;  // 选择框标题

    // 根据任务来源获取不同的任务列表
    if (taskSource === TaskSource.PackageJson) {
      items = await getPackageJsonScripts(workspaceFolders);  // 从package.json获取脚本
      title = 'Select npm script to run';  // 设置选择框标题
    } else {
      items = await getTasksJsonTasks(workspaceFolders);  // 从tasks.json获取任务
      title = 'Select npm task to run';  // 设置选择框标题
    }

    // 检查是否有可用的任务/脚本
    if (items.length === 0) {
      vscode.window.showInformationMessage(`No items found in ${taskSource}`);
      return;
    }

    // 创建快速选择框
    const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem>();
    quickPick.items = items;  // 设置选项列表
    quickPick.title = title;  // 设置标题

    quickPick.show();  // 显示选择框

    // 等待用户选择或取消
    const selectedItem = await new Promise<vscode.QuickPickItem | undefined>((resolve) => {
      // 用户确认选择时触发
      quickPick.onDidAccept(() => {
        resolve(quickPick.activeItems[0]);  // 返回当前选中的项
        quickPick.hide();  // 隐藏选择框
      });
      // 选择框被隐藏时触发(用户取消)
      quickPick.onDidHide(() => resolve(undefined));
    });

    if (selectedItem) {  // 检查是否有选中的项目
      let task: vscode.Task;  // 声明任务变量
      if (taskSource === TaskSource.PackageJson) {  // 判断任务来源是否为package.json
        // 创建package.json脚本任务
        task = new vscode.Task(  // 创建新任务实例
          { type: 'npm', script: selectedItem.label },  // 任务定义对象，包含类型和脚本名
          workspaceFolders[0],  // 指定工作区文件夹作为任务作用域
          selectedItem.label,   // 使用脚本名作为任务名称
          'npm',                // 指定任务来源为npm
          new vscode.ShellExecution(`npm run ${selectedItem.label}`)  // 创建shell执行命令
        );
      } else {                  // 处理tasks.json中的任务
        const selectedTask = (selectedItem as TaskQuickPickItem).task;  // 获取选中的任务定义
        if (selectedTask.type === 'npm') {  // 判断是否为npm类型任务
          task = new vscode.Task(  // 创建新任务实例
            selectedTask,          // 使用选中的任务定义
            workspaceFolders[0],   // 指定工作区文件夹
            selectedTask.label,    // 使用任务定义中的标签
            'npm',                 // 指定任务来源
            new vscode.ShellExecution(`npm run ${selectedTask.script}`)  // 创建shell执行命令
          );
        } else {  // 处理复合任务(dependsOn)
          const taskNames = selectedTask.dependsOn;  // 获取依赖任务列表
          const allTasks = await vscode.tasks.fetchTasks();  // 获取所有可用任务

          // 遍历执行每个依赖任务
          for (const taskName of taskNames) {  // 遍历每个依赖任务名
            // 查找匹配的任务
            const foundTasks = allTasks.filter(t =>  // 过滤匹配的任务
              t.name === taskName ||  // 匹配任务名
              (t.definition && t.definition.label === taskName)  // 或匹配任务定义中的标签
            );

            if (foundTasks.length > 0) {  // 如果找到匹配任务
              await vscode.tasks.executeTask(foundTasks[0]);  // 执行第一个匹配的任务
            } else {  // 如果未找到匹配任务
              const availableTasks = allTasks.map(t => t.name || t.definition?.label).join(', ');  // 获取所有可用任务名
              vscode.window.showErrorMessage(  // 显示错误信息
                `Dependent task "${taskName}" not found. Available tasks: ${availableTasks}`
              );
            }
          }
          return;  // 复合任务执行完成后返回
        }
      }
      vscode.tasks.executeTask(task);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error}`);
  }
}

/**
 * @brief 注册npm任务运行命令
 * @details 创建状态栏按钮并注册命令，按钮位于状态栏左侧最后位置，
 *          点击按钮将触发showNpmTasks函数
 * @param {vscode.ExtensionContext} context VS Code扩展上下文对象
 * @returns {void}
 * @example
 * // 注册示例
 * registerNpmRunTaskCommand(context);
 */
export function registerNpmRunTaskCommand(context: vscode.ExtensionContext) {
  // 创建状态栏按钮
  // 对齐方式: 左侧
  // 优先级: 1 (放在左侧最后)
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);

  // 设置按钮文本和图标
  statusBarItem.text = '$(run-all) npm run';  // 使用VS Code的run-all图标
  // 设置悬停提示
  statusBarItem.tooltip = 'Click to run npm tasks/scripts';  // 鼠标悬停时显示的提示
  // 设置点击命令
  statusBarItem.command = 'vssm-tool.runNpmTask';  // 点击时执行的命令ID
  // 显示按钮
  statusBarItem.show();  // 在状态栏显示按钮

  // 注册命令处理函数
  const disposable = vscode.commands.registerCommand(
    'vssm-tool.runNpmTask',  // 命令ID
    showNpmTasks  // 命令处理函数
  );

  // 将状态栏按钮和命令注册添加到扩展上下文
  // 这样在扩展停用时可以自动清理资源
  context.subscriptions.push(
    disposable,  // 命令注册
    statusBarItem  // 状态栏按钮
  );
}
