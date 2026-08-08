const assert = require("node:assert/strict");
const test = require("node:test");

const {
  NdjsonParser,
  ProtocolError,
  cleanCliMessage,
  isSafeSessionId,
  parseFrame,
} = require("../../dist/commandcode/protocol.js");

test("parses split event and result frames", () => {
  const parser = new NdjsonParser();
  assert.deepEqual(parser.push('{"type":"event","event":{"type":"run_'), []);
  const frames = parser.push(
    'start","sessionId":"abc"}}\n{"type":"result","subtype":"success","usage":{},"durationMs":4,"finalText":"ok"}\n',
  );
  assert.equal(frames.length, 2);
  assert.equal(frames[0].event.type, "run_start");
  assert.equal(frames[1].finalText, "ok");
});

test("parses a trailing frame without newline", () => {
  const parser = new NdjsonParser();
  parser.push('{"type":"event","event":{"type":"turn_end"}}');
  assert.equal(parser.finish()[0].event.type, "turn_end");
});

test("rejects malformed and oversized frames", () => {
  assert.throws(() => parseFrame("{bad json"), ProtocolError);
  assert.throws(() => parseFrame("x".repeat(20), 10), ProtocolError);
});

test("validates bounded results and safe resumable session identifiers", () => {
  assert.throws(
    () =>
      parseFrame(
        JSON.stringify({
          type: "result",
          subtype: "success",
          usage: {},
          durationMs: -1,
          finalText: "x",
        }),
      ),
    ProtocolError,
  );
  assert.equal(isSafeSessionId("fixture-session"), true);
  assert.equal(isSafeSessionId("../escape"), false);
  assert.equal(isSafeSessionId("x".repeat(201)), false);
});

test("ignores unknown top-level frame types", () => {
  assert.equal(parseFrame('{"type":"future","value":1}'), undefined);
});

test("strips terminal escapes and limits stderr lines", () => {
  const result = cleanCliMessage(
    "\u001b[31mred\u001b[0m\none\ntwo\nthree\nfour\nfive",
  );
  assert.equal(result, "two\nthree\nfour\nfive");
});
