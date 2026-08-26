# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run compile        # tsc compilation
npm run watch          # tsc watch mode (dev)
npm run postbuild      # copy src/template/ into out/template (required after compile)
npm run lint           # eslint src
npm run format:check   # prettier check
npm run format:fix     # prettier fix
npm test               # compile + lint, then run tests via vscode-test (Extension Host)
npm run vsix:build     # package .vsix with vsce
```

## Architecture

**vssm-tool** is a VS Code extension (TypeScript, strict mode, ES2022, Node16 modules) providing project scaffolding, config generation, dependency inspection, and IDE convenience features.

### Entry Point & Registration Pattern

`src/extension.ts` — `activate()` declares all commands/views in a single `commands` object with `{ register, enabled }` entries. A `tryRegister()` helper iterates with duplicate prevention via a `Set`.

### Module Layers

- **`src/cmd/`** — Command handlers. `generateConfigs.ts` and `addToIgnore.ts` use generic factory functions (`registerGenerateConfigCommand()`, `registerAddToIgnoreCommand()`) that accept config objects, making it easy to add new generators or ignore targets.
- **`src/views/`** — Sidebar view data sources + the chat webview host. Most files implement the `SnapshottableProvider` contract (`getSnapshot()` / optional `applyAction()` / `refresh()`) defined in `registry.ts`, so the chat webview can render the dependency explorer, config viewer, command list, template viewer, VS Code settings viewer, and a demo CRUD tree. `chat-webview.ts` is the `WebviewViewProvider` that hosts the React UI built by `webview-ui/`.
- **`src/language-features/`** — Document providers: `packageLinkProvider.ts` makes dependency names in package.json clickable to open node_modules; `markdownHover.ts` is currently disabled.
- **`src/helpers/utils.ts`** — Shared output channel ("VSSM-Tool") with logging that auto-includes caller file:line from stack traces.
- **`src/template/`** — Static scaffolding templates (`c-vscode/`, `cnb/`, `npm-package/`) copied into user workspaces by `initProject.ts`; shared default configs live in `default/DefaultTemplate.*`.

### Build-time Template Copy

`src/template/` must be copied into `out/template/` after compilation (shared `default/DefaultTemplate.*` included). This is handled by `npm run postbuild` using `shx`. The `vscode:prepublish` script chains compile + postbuild.

## Code Conventions

- Comments use Chinese JSDoc with `@brief`/`@details` tags
- ESLint rules are warnings (not errors): curly, eqeqeq, no-throw-literal, semi, naming-convention (camelCase/PascalCase)
- Prettier: 2-space indent, single quotes, trailing comma "none", 120 print width, LF line endings

## CI/CD

- Pushing to master with `[publish]` in the commit message triggers the all-in-one pipeline (`.github/workflows/publish-extension.yaml`): package VSIX → publish to VS Code Marketplace (`vsce publish --packagePath`) → create `v<version>` tag + GitHub Release attaching the VSIX
- `.cnb.yml` handles branch sync and cloud dev environment setup
