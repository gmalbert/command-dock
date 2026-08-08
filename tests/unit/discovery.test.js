const assert = require("node:assert/strict");
const test = require("node:test");
const {
  isVersionCompatible,
  parseSemver,
  resolveCliInvocation,
} = require("../../dist/commandcode/discovery.js");

test("rejects relative, missing, and symlinked CLI overrides", () => {
  assert.throws(
    () => resolveCliInvocation({ configuredPath: "./cmd.js" }),
    /absolute/,
  );
  assert.throws(
    () =>
      resolveCliInvocation({
        configuredPath: "C:\\tools\\cmd.mjs",
        platform: "win32",
        exists: () => false,
        realpath: (value) => value,
      }),
    /does not exist/,
  );
  assert.throws(
    () =>
      resolveCliInvocation({
        configuredPath: "C:\\tools\\cmd.mjs",
        platform: "win32",
        exists: () => true,
        realpath: () => "C:\\other\\cmd.mjs",
      }),
    /symbolic link/,
  );
});

test("resolves a trusted script through the extension host Node executable", () => {
  const invocation = resolveCliInvocation({
    configuredPath: "C:\\tools\\cmd.mjs",
    platform: "win32",
    exists: () => true,
    realpath: (value) => value,
  });
  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.prefixArgs, ["C:\\tools\\cmd.mjs"]);
  assert.equal(invocation.source, "setting");
});

test("discovers known installations and otherwise uses PATH without a shell", () => {
  const invocation = resolveCliInvocation({
    platform: "linux",
    homeDir: "/home/alice",
    exists: () => false,
  });
  assert.equal(invocation.command, "cmd");
  assert.equal(invocation.source, "path");
});

test("parses and enforces compatible CLI versions", () => {
  assert.deepEqual(parseSemver("Command Code v1.15.0"), [1, 15, 0]);
  assert.equal(isVersionCompatible("1.15.0"), true);
  assert.equal(isVersionCompatible("1.16.0"), true);
  assert.equal(isVersionCompatible("1.14.9"), false);
  assert.equal(isVersionCompatible("unknown"), false);
});
