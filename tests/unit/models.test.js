const assert = require("node:assert/strict");
const test = require("node:test");
const { parseModelList } = require("../../dist/commandcode/models.js");

test("parses the CLI model catalog with providers and capabilities", () => {
  const models = parseModelList(`Available models  ·  2 models

Open Source

deepseek/deepseek-v4-flash           fast hybrid-attention reasoning (default)
moonshotai/kimi-k2.7-code            improved long-horizon coding with vision

OpenAI

gpt-5.6-sol                          frontier model for complex professional work

Pass the full id, or just the short name after the last "/":`);
  assert.equal(models.length, 3);
  assert.equal(models[0].provider, "Open Source");
  assert.deepEqual(models[1].capabilities, ["vision", "long-context"]);
  assert.equal(models[2].provider, "OpenAI");
});
