const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const webview = fs.readFileSync(
  path.resolve(__dirname, "../../media/main.js"),
  "utf8",
);

test("keeps the turn pending until final activity updates are applied", () => {
  const assistantStart = webview.indexOf('if (data.type === "assistant")');
  const assistant = webview.slice(
    assistantStart,
    webview.indexOf('if (data.type === "turnError")', assistantStart),
  );
  const finishedStart = webview.indexOf('if (data.type === "turnFinished")');
  const finished = webview.slice(
    finishedStart,
    webview.indexOf("});", finishedStart),
  );

  assert.doesNotMatch(assistant, /turn\.status = ["']complete["']/);
  assert.match(finished, /turn\.status = ["']complete["']/);
  assert.match(finished, /renderTranscript\(\)/);
});

test("coalesces high-frequency progress rendering", () => {
  const activityStart = webview.indexOf('if (data.type === "activity")');
  const activity = webview.slice(
    activityStart,
    webview.indexOf('if (data.type === "assistantDelta")', activityStart),
  );
  const deltaStart = webview.indexOf('if (data.type === "assistantDelta")');
  const delta = webview.slice(
    deltaStart,
    webview.indexOf('if (data.type === "assistant")', deltaStart),
  );
  assert.match(activity, /scheduleTranscriptRender\(\)/);
  assert.doesNotMatch(activity, /renderTranscript\(\)/);
  assert.match(delta, /scheduleTranscriptRender\(\)/);
  assert.doesNotMatch(delta, /renderTranscript\(\)/);
});
