import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',
  // 打开夹具工作区：addToIgnore / generateConfigs / initProject 等命令依赖 workspaceFolders
  workspaceFolder: 'test-fixtures/demo-workspace',
  mocha: {
    // 文件 IO 与首次启动较慢，放宽单用例超时
    timeout: 20000
  }
});
