import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "dist/test/**/*.test.js",
  workspaceFolder: "tests/fixtures/workspace",
  mocha: { timeout: 20_000 },
  launchArgs: ["--disable-extensions"],
});
