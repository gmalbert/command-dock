const assert = require("node:assert/strict");
const test = require("node:test");
const { parseWebviewRequest } = require("../../dist/contracts.js");

test("accepts only known, bounded webview requests", () => {
  assert.deepEqual(parseWebviewRequest({ type: "ready", unexpected: true }), {
    type: "ready",
  });
  assert.deepEqual(parseWebviewRequest({ type: "confirmNewChat" }), {
    type: "confirmNewChat",
  });
  assert.deepEqual(
    parseWebviewRequest({ type: "setPermissionMode", mode: "yolo" }),
    { type: "setPermissionMode", mode: "yolo" },
  );
  assert.equal(
    parseWebviewRequest({ type: "setPermissionMode", mode: "sudo" }),
    undefined,
  );
  assert.equal(parseWebviewRequest({ type: "setAnalyze" }), undefined);
  assert.deepEqual(parseWebviewRequest({ type: "updateCli" }), {
    type: "updateCli",
  });
  assert.deepEqual(
    parseWebviewRequest({
      type: "prompt",
      text: "hello",
      model: "auto",
      effort: "high",
    }),
    {
      type: "prompt",
      text: "hello",
      model: "auto",
      effort: "high",
    },
  );
  assert.equal(
    parseWebviewRequest({ type: "prompt", text: "hello" }),
    undefined,
  );
  assert.equal(
    parseWebviewRequest({ type: "executeArbitraryCommand", command: "rm" }),
    undefined,
  );
  assert.equal(
    parseWebviewRequest({ type: "copy", text: "x".repeat(200_001) }),
    undefined,
  );
  assert.deepEqual(
    parseWebviewRequest({ type: "openFile", path: "src/a.ts" }),
    {
      type: "openFile",
      path: "src/a.ts",
    },
  );
  assert.equal(parseWebviewRequest({ type: "openFile", path: "" }), undefined);
  assert.equal(
    parseWebviewRequest({ type: "openFile", path: "x".repeat(4_001) }),
    undefined,
  );
  assert.deepEqual(
    parseWebviewRequest({ type: "openDiff", path: "src/a.ts" }),
    {
      type: "openDiff",
      path: "src/a.ts",
    },
  );
  assert.equal(parseWebviewRequest({ type: "openDiff", path: "" }), undefined);
});
