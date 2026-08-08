#!/usr/bin/env node
const { CommandCodeClient } = require("../dist/commandcode/client.js");
const { resolveCliInvocation } = require("../dist/commandcode/discovery.js");
const { buildRunArguments } = require("../dist/commandcode/security.js");

if (process.env.COMMANDCODE_LIVE_SMOKE !== "1") {
  console.error(
    "Set COMMANDCODE_LIVE_SMOKE=1 to run the opt-in live account smoke test.",
  );
  process.exit(2);
}

const invocation = resolveCliInvocation();
const client = new CommandCodeClient();
let finalText = "";
client
  .run(
    {
      invocation,
      cwd: process.cwd(),
      generation: 1,
      args: [
        ...buildRunArguments({
          prompt:
            "Reply with exactly COMMANDCODE_VSCODE_SMOKE_OK and do not use tools.",
          model: "deepseek/deepseek-v4-flash",
          permissionMode: "analyze",
          maxTurns: 3,
        }),
        "--trust",
        "--no-session",
      ],
      timeouts: { startupMs: 60_000, inactivityMs: 120_000, totalMs: 180_000 },
    },
    {
      onFrame(frame) {
        if (frame.type === "result") finalText = frame.finalText;
      },
    },
  )
  .then((result) => {
    if (result.error) throw new Error(result.error.message);
    if (!finalText.includes("COMMANDCODE_VSCODE_SMOKE_OK"))
      throw new Error(`Unexpected response: ${finalText}`);
    console.log("PASS live CommandCode client smoke test");
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
