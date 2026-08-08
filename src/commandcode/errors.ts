export interface ActionableError {
  message: string;
  action?: "signIn" | "retry" | "upgrade" | "settings" | "resume";
}

const EXIT_ERRORS: Record<number, ActionableError> = {
  1: {
    message:
      "CommandCode returned a general error. Review the details and retry.",
    action: "retry",
  },
  3: {
    message: "CommandCode could not authenticate this account.",
    action: "signIn",
  },
  4: {
    message:
      "CommandCode denied the requested operation. Review workspace and agent permissions.",
  },
  5: {
    message: "CommandCode is temporarily rate limited. Wait briefly and retry.",
    action: "retry",
  },
  6: {
    message:
      "CommandCode could not reach the service. Check the network and retry.",
    action: "retry",
  },
  7: {
    message:
      "The CommandCode service returned an error. Retry or check service status.",
    action: "retry",
  },
  8: {
    message: "CommandCode reached the configured turn limit.",
    action: "resume",
  },
  130: { message: "CommandCode was interrupted." },
};

export function mapExitCode(code: number | null, stderr = ""): ActionableError {
  const normalized = stderr.toLowerCase();
  if (/sign.?in|log.?in|unauthorized|authentication/.test(normalized))
    return EXIT_ERRORS[3]!;
  if (/credit|billing|balance|usage limit|usage exceeded/.test(normalized)) {
    return {
      message:
        "The CommandCode account has insufficient credits or reached a usage limit.",
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
          ? "CommandCode ended unexpectedly."
          : `CommandCode exited with code ${code}.`,
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
