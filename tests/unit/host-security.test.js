const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const host = fs.readFileSync(
  path.resolve(__dirname, "../../extension.js"),
  "utf8",
);

test("explicit project trust handoff lives in the run path, not sign-in", () => {
  const signIn = host.slice(
    host.indexOf("async signIn()"),
    host.indexOf("openCliSurface"),
  );
  const run = host.slice(
    host.indexOf("async runCommandCodeTurn"),
    host.indexOf("handleAgentEvent"),
  );
  assert.doesNotMatch(signIn, /Trust in Command Code|--trust/);
  assert.match(run, /Trust in Command Code/);
  assert.match(run, /args\.push\(["']--trust["']\)/);
  assert.ok(
    run.indexOf("Trust in Command Code") <
      Math.max(
        run.indexOf('args.push("--trust")'),
        run.indexOf("args.push('--trust')"),
      ),
  );
});

test("sign-in verifies structured status and uses a visible terminal", () => {
  const signIn = host.slice(
    host.indexOf("async signIn()"),
    host.indexOf("async updateCli()"),
  );
  assert.match(signIn, /getCliStatus\(invocation, \{ force: true \}\)/);
  assert.match(signIn, /status\.kind === ["']ready["']/);
  assert.match(signIn, /already signed in/);
  assert.match(signIn, /createTerminal/);
  assert.match(
    signIn,
    /shellArgs: \[\.\.\.invocation\.prefixArgs, ["']login["']\]/,
  );
  assert.doesNotMatch(signIn, /stdio: ["']ignore["']/);
  assert.doesNotMatch(signIn, /child\.unref/);
});

test("turn preflight shares structured status and preserves non-auth errors", () => {
  const run = host.slice(
    host.indexOf("async runCommandCodeTurnCore"),
    host.indexOf("handleAgentEvent"),
  );
  assert.match(run, /getCliStatus\(invocation\)/);
  assert.match(run, /cliStatus\.kind === ["']error["']/);
  assert.match(run, /cliStatus\.kind === ["']signed-out["']/);
  assert.doesNotMatch(run, /\["--version", "--no-auto-update"\]/);
});

test("backend status and model probes are single-flight", () => {
  const statusStart = host.indexOf("async getCliStatus");
  const status = host.slice(
    statusStart,
    host.indexOf("diagnostics()", statusStart),
  );
  const backend = host.slice(
    host.indexOf("async postBackendStatus"),
    host.indexOf("async getGitRepository"),
  );
  assert.match(status, /this\.cliStatusPromise\?\.key === key/);
  assert.match(status, /this\.modelCatalogPromise\?\.key === key/);
  assert.match(backend, /this\.turnPending \|\| this\.activeProcess/);
  assert.match(backend, /refreshModelCatalog\(invocation, status\.version\)/);
});

test("agent authorization is per turn and reset after completion", () => {
  const run = host.slice(
    host.indexOf("async runCommandCodeTurn"),
    host.indexOf("handleAgentEvent"),
  );
  assert.match(run, /Authorize This Turn/);
  assert.match(run, /permissionMode = ["']analyze["']/);
  assert.doesNotMatch(host, /workspaceState\.update\(["']permissionMode["']/);
});

test("interactive CLI surfaces re-check Workspace Trust", () => {
  const method = host.slice(
    host.indexOf("openCliSurface(args = [])"),
    host.indexOf(
      "async selectModel",
      host.indexOf("openCliSurface(args = [])"),
    ),
  );
  assert.match(method, /vscode\.workspace\.isTrusted/);
  assert.ok(
    method.indexOf("isTrusted") < method.indexOf("createTerminal"),
    "trust must be checked before creating the CLI terminal",
  );
});

test("CLI updates require confirmation and run in a visible terminal", () => {
  const method = host.slice(
    host.indexOf("async updateCli()"),
    host.indexOf("openCliSurface", host.indexOf("async updateCli()")),
  );
  assert.match(method, /showWarningMessage/);
  assert.match(method, /modal: true/);
  assert.match(method, /confirmation !== ["']Open Updater["']/);
  assert.match(method, /createTerminal/);
  assert.match(
    method,
    /shellArgs: \[\.\.\.invocation\.prefixArgs, ["']update["']\]/,
  );
  assert.match(method, /createInvocationEnvironment\(invocation\)/);
  assert.ok(
    method.indexOf("confirmation !==") < method.indexOf("createTerminal"),
    "confirmation must happen before opening the updater terminal",
  );
});

test("workspace file and folder actions enforce real-path containment", () => {
  const helper = host.slice(
    host.indexOf("function isSafeWorkspaceUri"),
    host.indexOf("function humanizeToolName"),
  );
  assert.match(helper, /realpathSync\.native\(uri\.fsPath\)/);
  assert.match(helper, /realpathSync\.native\(folder\.uri\.fsPath\)/);
  assert.match(helper, /startsWith/);
  for (const callSite of [
    "pickedDirectories || []",
    "resolveWorkspacePath(requestedPath)",
    "unsafeContext",
  ])
    assert.ok(
      host.includes(callSite),
      `missing safe-path call site: ${callSite}`,
    );
});

test("branch creation uses the multi-repository chooser", () => {
  const method = host.slice(
    host.indexOf("async createBranch()"),
    host.indexOf(
      "async runCommandCodeTurn",
      host.indexOf("async createBranch()"),
    ),
  );
  assert.match(method, /await this\.chooseGitRepository\(\)/);
  assert.doesNotMatch(method, /await this\.getGitRepository\(\)/);
});

test("copyable diagnostics pass through the redactor", () => {
  const method = host.slice(
    host.indexOf("diagnostics()"),
    host.indexOf("async clearLocalData", host.indexOf("diagnostics()")),
  );
  assert.match(method, /return redactDiagnostic\(/);
});

test("clear local data removes workspace and global extension-owned state", () => {
  const method = host.slice(
    host.indexOf("async clearLocalData"),
    host.indexOf("async resumeLatest", host.indexOf("async clearLocalData")),
  );
  for (const key of [
    "commandDockSessionLinks",
    "selectedModel",
    "commandDockProjectTrusted",
    "modelCatalog",
    "localDataCleared",
  ])
    assert.ok(method.includes(key), `clearLocalData must remove ${key}`);
});

test("extension disposal terminates status and model probe processes", () => {
  const method = host.slice(
    host.indexOf("dispose()"),
    host.indexOf("setRunActive", host.indexOf("dispose()")),
  );
  assert.match(
    method,
    /for \(const child of this\.probeProcesses\) child\.kill\(\)/,
  );
  assert.match(method, /this\.probeProcesses\.clear\(\)/);
});
