# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run compile        # tsc compilation
npm run watch          # tsc watch mode (dev)
npm run postbuild      # copy DefaultTemplate.* and src/template/ into out/ (required after compile)
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
- **`src/tree-views/`** — Sidebar tree data providers (dependency explorer, config viewer, command list, template viewer, VS Code settings viewer, demo CRUD tree). All follow the VS Code `TreeDataProvider` pattern with `_onDidChangeTreeData` event emitters.
- **`src/language-features/`** — Document providers: `packageLinkProvider.ts` makes dependency names in package.json clickable to open node_modules; `markdownHover.ts` is currently disabled.
- **`src/helpers/utils.ts`** — Shared output channel ("VSSM-Tool") with logging that auto-includes caller file:line from stack traces.
- **`src/template/`** — Static scaffolding templates (`c-vscode/`, `cnb/`) copied into user workspaces by `initProject.ts`.

### Build-time Template Copy

Default templates (`src/DefaultTemplate.*`) and `src/template/` must be copied into `out/` after compilation. This is handled by `npm run postbuild` using `shx`. The `vscode:prepublish` script chains compile + postbuild.

## Code Conventions

- Comments use Chinese JSDoc with `@brief`/`@details` tags
- ESLint rules are warnings (not errors): curly, eqeqeq, no-throw-literal, semi, naming-convention (camelCase/PascalCase)
- Prettier: 2-space indent, single quotes, trailing comma "none", 120 print width, LF line endings

## CI/CD

- Pushing to master with `[publish]` in the commit message triggers VS Code Marketplace publishing (`.github/workflows/npm-publish.yaml`)
- A companion workflow auto-creates GitHub Releases with version validation
- `.cnb.yml` handles branch sync and cloud dev environment setup
