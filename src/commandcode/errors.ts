export interface ActionableError {
  message: string;
  action?: "signIn" | "retry" | "upgrade" | "settings" | "resume";
}

const EXIT_ERRORS: Record<number, ActionableError> = {
  1: {
    message:
      "Command Code returned a general error. Review the details and retry.",
    action: "retry",
  },
  3: {
    message: "Command Code could not authenticate this account.",
    action: "signIn",
  },
  4: {
    message:
      "Command Code denied the requested operation. Review workspace and agent permissions.",
  },
  5: {
    message: "Command Code is temporarily rate limited. Wait briefly and retry.",
    action: "retry",
  },
  6: {
    message:
      "Command Code could not reach the service. Check the network and retry.",
    action: "retry",
  },
  7: {
    message:
      "The Command Code service returned an error. Retry or check service status.",
    action: "retry",
  },
  8: {
    message: "Command Code reached the configured turn limit.",
    action: "resume",
  },
  130: { message: "Command Code was interrupted." },
};

const LAUNCH_FAILURE =
  /ENOENT|EACCES|EPERM|is not recognized|not recognized|no such file or directory|command not found|spawn\b/i;

export function isLaunchFailure(value: string): boolean {
  return typeof value === "string" && LAUNCH_FAILURE.test(value);
}

export function mapExitCode(code: number | null, stderr = ""): ActionableError {
  const normalized = stderr.toLowerCase();
  if (/sign.?in|log.?in|unauthorized|authentication/.test(normalized))
    return EXIT_ERRORS[3]!;
  if (isLaunchFailure(stderr)) {
    return {
      message:
        "Command Code CLI could not be started. Install it with `npm install -g command-code` or set the `commandDock.cliPath` setting, then reload VS Code.",
      action: "settings",
    };
  }
  if (/credit|billing|balance|usage limit|usage exceeded/.test(normalized)) {
    return {
      message:
        "The Command Code account has insufficient credits or reached a usage limit.",
      action: "upgrade",
    };
  }
  if (/rate.?limit|too many requests/.test(normalized)) return EXIT_ERRORS[5]!;
  if (/network|enotfound|econnreset|timed? ?out/.test(normalized))
    return EXIT_ERRORS[6]!;
  return (
    (code !== null && EXIT_ERRORS[code]) || {
      message:
        code === null
          ? "Command Code ended unexpectedly."
          : `Command Code exited with code ${code}.`,
      action: "retry",
    }
  );
}

export function redactDiagnostic(value: string): string {
  return value
    .replace(
      /\b(?:sk-|ghp_|github_pat_|xox[baprs]-)[-A-Za-z0-9_]{8,}\b/g,
      "[REDACTED_TOKEN]",
    )
    .replace(
      /\b(api[_-]?key|authorization|token|password)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/gi, "%USERPROFILE%")
    .replace(/\/home\/[^/\s]+/g, "~")
    .slice(-12_000);
}
