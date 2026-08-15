const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildRunArguments,
  createCliEnvironment,
  isTrustedCliPath,
  normalizeRelativeContextPath,
} = require("../../dist/commandcode/security.js");

test("analyze mode selects the CLI read-only plan permission without trust bypass", () => {
  const args = buildRunArguments({
    prompt: "review",
    permissionMode: "analyze",
    maxTurns: 100,
  });
  assert.equal(args.includes("--auto-accept"), false);
  assert.equal(args.includes("--trust"), false);
  assert.deepEqual(args.slice(-2), ["--permission-mode", "plan"]);
});

test("agent mode includes auto-accept only when explicitly selected", () => {
  const args = buildRunArguments({
    prompt: "fix it",
    permissionMode: "agent",
    maxTurns: 10,
  });
  assert.equal(args.includes("--auto-accept"), false);
  assert.deepEqual(args.slice(-2), ["--permission-mode", "auto-accept"]);
});

test("yolo mode passes --yolo and auto-accept only when explicitly selected", () => {
  const args = buildRunArguments({
    prompt: "fix it",
    permissionMode: "yolo",
    maxTurns: 10,
    yolo: true,
  });
  assert.ok(args.includes("--yolo"));
  assert.equal(args.includes("--auto-accept"), false);
  assert.deepEqual(args.slice(-2), ["--permission-mode", "auto-accept"]);
});

test("analyze and agent modes never inject --yolo", () => {
  const analyze = buildRunArguments({
    prompt: "p",
    permissionMode: "analyze",
    maxTurns: 5,
  });
  const agent = buildRunArguments({
    prompt: "p",
    permissionMode: "agent",
    maxTurns: 5,
  });
  assert.equal(analyze.includes("--yolo"), false);
  assert.equal(agent.includes("--yolo"), false);
});

test("prompt is passed as an argument without shell interpolation", () => {
  const prompt = "explain $(whoami) & del important.txt";
  const args = buildRunArguments({
    prompt,
    permissionMode: "analyze",
    maxTurns: 1,
  });
  assert.equal(args[1], prompt);
});

test("context cannot escape the workspace", () => {
  assert.equal(normalizeRelativeContextPath("src\\index.ts"), "src/index.ts");
  assert.throws(() => normalizeRelativeContextPath("../secret.txt"));
  assert.throws(() => normalizeRelativeContextPath("C:\\secret.txt"));
});

test("CLI overrides must be absolute supported files", () => {
  assert.equal(isTrustedCliPath("cmdc"), false);
  assert.equal(isTrustedCliPath("C:\\tools\\command-code.mjs"), true);
  assert.equal(isTrustedCliPath("C:\\tools\\wrapper.cmd"), false);
});

test("CLI environment keeps runtime essentials and drops unrelated secrets", () => {
  const env = createCliEnvironment({
    PATH: "/bin",
    HOME: "/home/test",
    CMD_API_KEY: "commandcode-key",
    GITHUB_TOKEN: "secret",
    DATABASE_PASSWORD: "secret",
  });
  assert.equal(env.PATH, "/bin");
  assert.equal(env.CMD_API_KEY, "commandcode-key");
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.DATABASE_PASSWORD, undefined);
  assert.equal(env.NO_COLOR, "1");
});

test("CLI environment can run a discovered script through VS Code's Electron runtime", () => {
  const env = createCliEnvironment(
    { PATH: "/bin", ELECTRON_RUN_AS_NODE: "untrusted-input" },
    { electronRunAsNode: true },
  );
  assert.equal(env.ELECTRON_RUN_AS_NODE, "1");
});
