// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { registerHelloWorldCommand } from './cmd/helloworld';
import { registerCursorPositionCommand } from './cmd/cursor-position';
import {
  registerGenerateConfigCommand,
  GenerateEditorConfigCommand,
  GenerateWorkspaceConfigCommand,
  GenerateClangFormatCommand
} from './cmd/generateConfigs';
import { registerNpmRunTaskCommand } from './cmd/npm-run-task';
import {
  registerAddToIgnoreCommand,
  AddToPrettierIgnoreCommand,
  AddToGitIgnoreCommand,
  AddToVScodeIgnoreCommand
} from './cmd/addToIgnore';
import { registerMarkdownHoverProvider } from './language-features/markdownHover';
import { registerPackageLinkProvider } from './language-features/packageLinkProvider';
import { registerConfigView } from './tree-views/vssm-tool-config';
import { registerDefaultTemplateView } from './tree-views/default-template-view';
import { registerNodeDependenciesView } from './tree-views/vssm-tool-node-dependencies';
import { registerCommandsView } from './tree-views/vssm-tool-cmd';
import { registerFixedDataView } from './tree-views/fixed-data-provider';
import { registerVSCodeSettingsView } from './tree-views/vscode-settings-view';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const registeredCommands = new Set<string>();

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "vssm-tool" is now active!');

  // Define all commands with their registration functions and enabled status
  const commands = {
    helloWorld: {
      register: registerHelloWorldCommand,
      enabled: true
    },
    cursorPosition: {
      register: registerCursorPositionCommand,
      enabled: true
    },
    generateEditorConfig: {
      register: (ctx: vscode.ExtensionContext) => registerGenerateConfigCommand(ctx, GenerateEditorConfigCommand),
      enabled: true
    },
    generateWorkspaceConfig: {
      register: (ctx: vscode.ExtensionContext) => registerGenerateConfigCommand(ctx, GenerateWorkspaceConfigCommand),
      enabled: true
    },
    generateClangFormat: {
      register: (ctx: vscode.ExtensionContext) => registerGenerateConfigCommand(ctx, GenerateClangFormatCommand),
      enabled: true
    },
    npmRunTask: {
      register: registerNpmRunTaskCommand,
      enabled: true
    },
    addToPrettierIgnore: {
      register: (ctx: vscode.ExtensionContext) => registerAddToIgnoreCommand(ctx, AddToPrettierIgnoreCommand),
      enabled: true
    },
    addToGitIgnore: {
      register: (ctx: vscode.ExtensionContext) => registerAddToIgnoreCommand(ctx, AddToGitIgnoreCommand),
      enabled: true
    },
    AddToVScodeIgnoreCommand: {
      register: (ctx: vscode.ExtensionContext) => registerAddToIgnoreCommand(ctx, AddToVScodeIgnoreCommand),
      enabled: true
    },
    markdownHover: {
      register: registerMarkdownHoverProvider,
      enabled: false // 暂不启用Markdown Hover功能
    },
    packageLink: {
      register: registerPackageLinkProvider,
      enabled: true
    },
    configView: {
      register: registerConfigView,
      enabled: true
    },
    defaultTemplateView: {
      register: registerDefaultTemplateView,
      enabled: true
    },
    nodeDependenciesView: {
      register: registerNodeDependenciesView,
      enabled: true
    },
    commandsView: {
      register: registerCommandsView,
      enabled: true
    },
    fixedDataView: {
      register: registerFixedDataView,
      enabled: true
    },
    vscodeSettingsView: {
      register: registerVSCodeSettingsView,
      enabled: true
    }
  };

  // Register commands with duplicate prevention
  const registrationResults = {
    success: 0,
    skipped: 0,
    failed: 0
  };

  function tryRegister(name: string, registerFn: (ctx: vscode.ExtensionContext) => string | boolean): void {
    if (registeredCommands.has(name)) {
      console.warn(`Command "${name}" already registered, skipping`);
      registrationResults.skipped++;
      return;
    }

    const result = registerFn(context);
    const commandName = typeof result === 'string' ? result : name;

    if (result) {
      registeredCommands.add(commandName);
      registrationResults.success++;
    } else {
      registrationResults.failed++;
    }
  }

  // Register all enabled commands
  for (const [name, { register, enabled }] of Object.entries(commands)) {
    if (enabled) {
      tryRegister(name, register);
    } else {
      // console.warn(`Command "${name}" is disabled, skipping registration`);
      registrationResults.skipped++;
    }
  }

  console.log(`Command registration results: 
    Success: ${registrationResults.success}, 
    Skipped: ${registrationResults.skipped}, 
    Failed: ${registrationResults.failed}`);
}

// This method is called when your extension is deactivated
export function deactivate() {}
