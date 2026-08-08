import { isVersionCompatible, MINIMUM_CLI_VERSION } from "./discovery";

export interface CliStatusProbe {
  ok: boolean;
  stdout: string;
  stderr: string;
  error: string;
}

export type CliStatusResult =
  | { kind: "ready"; version: string }
  | { kind: "signed-out"; version?: string }
  | { kind: "incompatible"; version: string }
  | { kind: "error"; message: string };

const AUTH_FAILURE =
  /not logged|signed out|unauthenticated|login required|authentication required/i;

export function classifyCliStatus(
  probe: CliStatusProbe,
  minimumVersion = MINIMUM_CLI_VERSION,
): CliStatusResult {
  const combined = `${probe.stdout}\n${probe.stderr}`;
  if (!probe.ok) {
    if (AUTH_FAILURE.test(combined)) return { kind: "signed-out" };
    return {
      kind: "error",
      message: probe.error || "Command Code status could not be verified.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(probe.stdout.trim());
  } catch {
    return {
      kind: "error",
      message: "Command Code returned an invalid status response.",
    };
  }
  if (!isRecord(parsed)) {
    return {
      kind: "error",
      message: "Command Code returned an invalid status response.",
    };
  }

  const version = typeof parsed.version === "string" ? parsed.version : "";
  if (parsed.authenticated === false)
    return { kind: "signed-out", ...(version ? { version } : {}) };
  if (parsed.authenticated !== true) {
    return {
      kind: "error",
      message: "Command Code did not report its authentication state.",
    };
  }
  if (!version) {
    return {
      kind: "error",
      message: "Command Code did not report its version.",
    };
  }
  if (!isVersionCompatible(version, minimumVersion))
    return { kind: "incompatible", version };
  return { kind: "ready", version };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
