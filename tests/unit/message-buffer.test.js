const assert = require("node:assert/strict");
const test = require("node:test");
const {
  TurnMessageBuffer,
} = require("../../dist/commandcode/messageBuffer.js");

test("coalesces high-frequency activity and delta messages", async () => {
  const posted = [];
  const buffer = new TurnMessageBuffer((message) => posted.push(message), {
    delayMs: 10,
  });
  for (let index = 0; index < 500; index += 1) {
    buffer.send({
      type: "activity",
      id: "tool-1",
      detail: `update-${index}`,
    });
    buffer.send({ type: "assistantDelta", text: "x" });
  }
  assert.equal(posted.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(posted.length, 2);
  assert.equal(posted[0].detail, "update-499");
  assert.equal(posted[1].text.length, 500);
});

test("flushes streamed content before a terminal message", () => {
  const posted = [];
  const buffer = new TurnMessageBuffer((message) => posted.push(message));
  buffer.send({ type: "assistantDelta", text: "partial" });
  buffer.send({ type: "turnFinished" });
  assert.deepEqual(
    posted.map((message) => message.type),
    ["assistantDelta", "turnFinished"],
  );
});
