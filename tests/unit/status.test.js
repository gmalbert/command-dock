const assert = require("node:assert/strict");
const test = require("node:test");
const { classifyCliStatus } = require("../../dist/commandcode/status.js");

const successfulProbe = (value) => ({
  ok: true,
  stdout: JSON.stringify(value),
  stderr: "",
  error: "",
});

test("uses structured CLI status instead of guessing authentication", () => {
  assert.deepEqual(
    classifyCliStatus(
      successfulProbe({ authenticated: true, version: "1.15.0" }),
    ),
    { kind: "ready", version: "1.15.0" },
  );
  assert.deepEqual(
    classifyCliStatus(
      successfulProbe({ authenticated: false, version: "1.15.0" }),
    ),
    { kind: "signed-out", version: "1.15.0" },
  );
  assert.deepEqual(
    classifyCliStatus(
      successfulProbe({ authenticated: true, version: "1.14.9" }),
    ),
    { kind: "incompatible", version: "1.14.9" },
  );
});

test("does not misreport timeouts and malformed responses as sign-out", () => {
  assert.deepEqual(
    classifyCliStatus({
      ok: false,
      stdout: "",
      stderr: "",
      error: "Command Code status check timed out.",
    }),
    { kind: "error", message: "Command Code status check timed out." },
  );
  assert.deepEqual(classifyCliStatus(successfulProbe({ version: "1.15.0" })), {
    kind: "error",
    message: "Command Code did not report its authentication state.",
  });
  assert.deepEqual(
    classifyCliStatus({
      ok: false,
      stdout: "",
      stderr: "Login required",
      error: "Command Code exited with code 3.",
    }),
    { kind: "signed-out" },
  );
});
