import path from "node:path";

export type PermissionMode = "analyze" | "agent";

export interface RunArguments {
  prompt: string;
  model?: string;
  sessionId?: string;
  permissionMode: PermissionMode;
  maxTurns: number;
  contextFiles?: readonly string[];
  effort?: "low" | "medium" | "high";
}

export function buildRunArguments(options: RunArguments): string[] {
  const maxTurns = Math.max(1, Math.min(500, Math.trunc(options.maxTurns)));
  const contextFiles = (options.contextFiles ?? []).map(
    normalizeRelativeContextPath,
  );
  const prompt = contextFiles.length
    ? `${options.prompt.trim()}\n\nFiles explicitly attached as context:\n${contextFiles.map((file) => `- ${file}`).join("\n")}`
    : options.prompt.trim();

  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--skip-onboarding",
    "--no-auto-update",
    "--max-turns",
    String(maxTurns),
  ];
  if (options.model && options.model !== "auto")
    args.push("--model", options.model);
  if (options.sessionId) args.push("--resume", options.sessionId);
  // Plan is the CLI's documented read-only mode. Auto-accept is deliberately
  // limited to an explicitly authorized Agent turn.
  args.push(
    "--permission-mode",
    options.permissionMode === "agent" ? "auto-accept" : "plan",
  );
  if (options.effort) args.push("--effort", options.effort);
  return args;
}

export function normalizeRelativeContextPath(value: string): string {
  if (!value || path.posix.isAbsolute(value) || path.win32.isAbsolute(value))
    throw new Error("Context paths must be relative to the workspace.");
  const normalized = value.replaceAll("\\", "/");
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error("Context paths cannot escape the workspace.");
  }
  return normalized;
}

export function isTrustedCliPath(value: string): boolean {
  const isWindowsPath = path.win32.isAbsolute(value);
  if (!isWindowsPath && !path.posix.isAbsolute(value)) return false;
  const extension = (isWindowsPath ? path.win32 : path.posix)
    .extname(value)
    .toLowerCase();
  return [".js", ".cjs", ".mjs", ".exe"].includes(extension);
}

export function createCliEnvironment(
  input: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const output: NodeJS.ProcessEnv = {};
  const allowed =
    /^(?:PATH|PATHEXT|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|TEMP|TMP|SHELL|COMSPEC|SYSTEMROOT|WINDIR|LANG|LC_.+|TERM|COLORTERM|WSL.+|SSH_AUTH_SOCK|HTTP_PROXY|HTTPS_PROXY|NO_PROXY|CMD_.+|COMMANDCODE_.+)$/i;
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && allowed.test(key)) output[key] = value;
  }
  output.NO_COLOR = "1";
  return output;
}
