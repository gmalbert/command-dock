const assert = require("node:assert/strict");
const test = require("node:test");
const {
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

test("redacts secrets and user home paths", () => {
  const output = redactDiagnostic(
    "api_key=secret-value C:\\Users\\alice\\project ghp_abcdefghijklmnopqrstuvwxyz",
  );
  assert.doesNotMatch(output, /secret-value|alice|ghp_/);
  assert.match(output, /REDACTED/);
});
