const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { CommandCodeClient } = require("../../dist/commandcode/client.js");
const {
  DEFAULT_TIMEOUTS,
} = require("../../dist/commandcode/processSupervisor.js");

const invocation = {
  command: process.execPath,
  prefixArgs: [path.resolve(__dirname, "../fixtures/fake-commandcode.js")],
  displayPath: "fixture",
  source: "setting",
};

test("uses release-safe process timeout boundaries", () => {
  assert.deepEqual(DEFAULT_TIMEOUTS, {
    startupMs: 60_000,
    inactivityMs: 120_000,
    totalMs: 30 * 60_000,
  });
});

test("client consumes deterministic NDJSON and reports a final result", async () => {
  const frames = [];
  const client = new CommandCodeClient();
  const result = await client.run(
    { invocation, args: ["-p", "hello"], cwd: process.cwd(), generation: 4 },
    {
      onFrame: (frame) => frames.push(frame),
    },
  );
  assert.equal(result.finalReceived, true);
  assert.equal(result.error, undefined);
  assert.equal(frames.at(-1).finalText, "fixture:hello");
});

test("client rejects malformed output", async () => {
  const client = new CommandCodeClient();
  const result = await client.run(
    {
      invocation,
      args: [],
      cwd: process.cwd(),
      generation: 1,
      env: { FAKE_CLI_MODE: "malformed" },
    },
    {
      onFrame: () => {},
    },
  );
  assert.match(result.error.message, /malformed JSON/);
});

test("client cancels the complete fixture process", async () => {
  const client = new CommandCodeClient();
  const running = client.run(
    {
      invocation,
      args: [],
      cwd: process.cwd(),
      generation: 2,
      env: { FAKE_CLI_MODE: "hang" },
      timeouts: { startupMs: 5_000, inactivityMs: 5_000, totalMs: 5_000 },
    },
    { onFrame: () => {} },
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  await client.cancel();
  const result = await running;
  assert.equal(result.cancelled, true);
  assert.equal(client.running, false);
});

test("cancellation terminates a fixture subprocess tree", async () => {
  const pidFile = path.join(
    os.tmpdir(),
    `commandcode-child-${process.pid}-${Date.now()}.txt`,
  );
  const client = new CommandCodeClient();
  const running = client.run(
    {
      invocation,
      args: [],
      cwd: process.cwd(),
      generation: 3,
      env: { FAKE_CLI_MODE: "tree", FAKE_CHILD_PID_FILE: pidFile },
      timeouts: { startupMs: 5_000, inactivityMs: 5_000, totalMs: 5_000 },
    },
    { onFrame: () => {} },
  );
  for (let attempt = 0; attempt < 40 && !fs.existsSync(pidFile); attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(
    fs.existsSync(pidFile),
    true,
    "fixture child PID was not written",
  );
  const childPid = Number(fs.readFileSync(pidFile, "utf8"));
  await client.cancel();
  const result = await running;
  await new Promise((resolve) => setTimeout(resolve, 200));
  let childAlive = true;
  try {
    process.kill(childPid, 0);
  } catch {
    childAlive = false;
  }
  fs.unlinkSync(pidFile);
  assert.equal(result.cancelled, true);
  assert.equal(
    childAlive,
    false,
    `subprocess ${childPid} survived cancellation`,
  );
});
