const assert = require("node:assert/strict");
const test = require("node:test");
const {
  isLaunchFailure,
  mapExitCode,
  redactDiagnostic,
} = require("../../dist/commandcode/errors.js");

test("maps documented failures to safe next actions", () => {
  assert.equal(mapExitCode(3).action, "signIn");
  assert.equal(mapExitCode(5).action, "retry");
  assert.equal(mapExitCode(8).action, "resume");
  assert.match(mapExitCode(7).message, /service/);
  assert.match(mapExitCode(17).message, /17/);
});

test("stderr hints take priority over unknown exit codes", () => {
  assert.equal(mapExitCode(99, "Unauthorized: please login").action, "signIn");
  assert.equal(mapExitCode(99, "insufficient credits").action, "upgrade");
});

test("maps CLI launch failures to a friendly install prompt", () => {
  for (const [code, detail] of [
    [1, "spawn cmdc ENOENT"],
    [1, "command not found: cmdc"],
    [1, "'cmdc' is not recognized as an internal or external command"],
    [1, "ENOENT: no such file or directory, spawn 'cmdc'"],
    [126, "EACCES: permission denied"],
    [126, "EPERM: operation not permitted"],
  ]) {
    const mapped = mapExitCode(code, detail);
    assert.equal(mapped.action, "settings", detail);
    assert.match(mapped.message, /npm install -g command-code/, detail);
  }
});

test("isLaunchFailure recognizes spawn and missing-command errors", () => {
  assert.ok(isLaunchFailure("spawn cmdc ENOENT"));
  assert.ok(isLaunchFailure("'cmdc' is not recognized"));
  assert.ok(isLaunchFailure("command not found: cmdc"));
  assert.ok(isLaunchFailure("EACCES: permission denied"));
  assert.ok(isLaunchFailure("ENOENT, no such file or directory"));
  assert.ok(!isLaunchFailure("Unauthorized: please login"));
  assert.ok(!isLaunchFailure("insufficient credits"));
  assert.ok(!isLaunchFailure("the API returned an unexpected error"));
});

test("redacts secrets and user home paths", () => {
  const output = redactDiagnostic(
    "api_key=secret-value C:\\Users\\alice\\project ghp_abcdefghijklmnopqrstuvwxyz",
  );
  assert.doesNotMatch(output, /secret-value|alice|ghp_/);
  assert.match(output, /REDACTED/);
});
