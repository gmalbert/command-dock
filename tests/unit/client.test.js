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

test("does not time out production turns that remain alive", () => {
  assert.deepEqual(DEFAULT_TIMEOUTS, {});
});

test("client allows a healthy process to stay quiet after startup", async () => {
  const client = new CommandCodeClient();
  const result = await client.run(
    {
      invocation,
      args: [],
      cwd: process.cwd(),
      generation: 5,
      env: { FAKE_CLI_MODE: "silent-after-start", FAKE_DELAY_MS: "250" },
    },
    { onFrame: () => {} },
  );
  assert.equal(result.finalReceived, true);
  assert.equal(result.error, undefined);
});

test("client can opt into finite inactivity limits for smoke tests", async () => {
  const client = new CommandCodeClient();
  const result = await client.run(
    {
      invocation,
      args: [],
      cwd: process.cwd(),
      generation: 6,
      env: { FAKE_CLI_MODE: "silent-after-start", FAKE_DELAY_MS: "250" },
      timeouts: { inactivityMs: 50 },
    },
    { onFrame: () => {} },
  );
  assert.equal(result.finalReceived, false);
  assert.match(result.error.message, /stopped producing output/);
});

test("client streams more than 10,000 events without an arbitrary turn cap", async () => {
  const frames = [];
  const client = new CommandCodeClient();
  const result = await client.run(
    {
      invocation,
      args: [],
      cwd: process.cwd(),
      generation: 7,
      env: { FAKE_CLI_MODE: "burst", FAKE_EVENT_COUNT: "12500" },
    },
    { onFrame: (frame) => frames.push(frame) },
  );
  assert.equal(result.finalReceived, true);
  assert.equal(result.error, undefined);
  assert.equal(frames.length, 12_502);
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
