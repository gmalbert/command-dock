const assert = require("node:assert/strict");
const test = require("node:test");
const { validateBranchName } = require("../../dist/git.js");

test("accepts common Git branch names and rejects dangerous refs", () => {
  assert.equal(validateBranchName("feature/chat-ui"), undefined);
  for (const value of [
    "",
    "-bad",
    ".hidden",
    "bad name",
    "a..b",
    "a@{b",
    "a//b",
    "main.lock",
    "a?b",
  ]) {
    assert.equal(typeof validateBranchName(value), "string", value);
  }
});
