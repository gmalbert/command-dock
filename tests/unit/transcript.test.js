const assert = require("node:assert/strict");
const test = require("node:test");
const { migrateTranscriptState } = require("../../dist/transcript.js");

test("migrates structured transcript entries without accepting HTML fields", () => {
  const state = migrateTranscriptState({
    transcript: [
      {
        id: "1",
        role: "user",
        text: "<img onerror=alert(1)>",
        innerHTML: "<script>bad()</script>",
      },
      {
        id: "2",
        role: "assistant",
        status: "pending",
        text: "partial",
        innerHTML: "<b>partial</b>",
      },
      { role: "system", text: "drop me" },
    ],
  });
  assert.equal(state.version, 1);
  assert.equal(state.transcript.length, 2);
  assert.equal(state.transcript[0].text, "<img onerror=alert(1)>");
  assert.equal("innerHTML" in state.transcript[0], false);
  assert.equal(state.transcript[1].status, "cancelled");
});
