#!/usr/bin/env node
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("1.15.0");
  process.exit(0);
}
if (args[0] === "status") {
  console.log(
    JSON.stringify({
      authenticated: true,
      version: "1.15.0",
      user: "test@example.invalid",
    }),
  );
  process.exit(0);
}
if (args.includes("--list-models")) {
  console.log(
    "Available models  ·  1 models\n\nFixture\n\nfixture/test-model  deterministic test model",
  );
  process.exit(0);
}
if (process.env.FAKE_CLI_MODE === "malformed") {
  console.log("{not-json");
  process.exit(0);
}
if (process.env.FAKE_CLI_MODE === "burst") {
  const count = Number(process.env.FAKE_EVENT_COUNT || 12_000);
  const lines = [
    JSON.stringify({
      type: "event",
      event: { type: "run_start", sessionId: "fixture-session" },
    }),
  ];
  for (let index = 0; index < count; index += 1)
    lines.push(
      JSON.stringify({
        type: "event",
        event: {
          type: "tool_update",
          toolCallId: "burst",
          message: `event-${index}`,
        },
      }),
    );
  lines.push(
    JSON.stringify({
      type: "result",
      subtype: "success",
      sessionId: "fixture-session",
      stopReason: "done",
      usage: { totalTokens: count },
      durationMs: 100,
      finalText: `fixture:burst:${count}`,
    }),
  );
  process.stdout.write(`${lines.join("\n")}\n`, () => {});
} else if (process.env.FAKE_CLI_MODE === "silent-after-start") {
  const delayMs = Number(process.env.FAKE_DELAY_MS || 250);
  console.log(
    JSON.stringify({
      type: "event",
      event: { type: "run_start", sessionId: "fixture-session" },
    }),
  );
  setTimeout(() => {
    console.log(
      JSON.stringify({
        type: "result",
        subtype: "success",
        sessionId: "fixture-session",
        stopReason: "done",
        usage: { totalTokens: 7 },
        durationMs: delayMs,
        finalText: "fixture:quiet-success",
      }),
    );
  }, delayMs);
} else if (process.env.FAKE_CLI_MODE === "tree") {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  fs.writeFileSync(process.env.FAKE_CHILD_PID_FILE, String(child.pid));
  console.log(JSON.stringify({ type: "event", event: { type: "run_start" } }));
  setInterval(() => {}, 1_000);
} else if (process.env.FAKE_CLI_MODE === "hang") {
  setInterval(() => {}, 1_000);
} else {
  const promptIndex = args.indexOf("-p");
  const prompt = promptIndex >= 0 ? args[promptIndex + 1] : "";
  console.log(
    JSON.stringify({
      type: "event",
      event: { type: "run_start", sessionId: "fixture-session" },
    }),
  );
  console.log(
    JSON.stringify({
      type: "result",
      subtype: "success",
      sessionId: "fixture-session",
      stopReason: "done",
      usage: { totalTokens: 7 },
      durationMs: 12,
      finalText: `fixture:${prompt}`,
    }),
  );
}
