import { isRecord } from "./commandcode/protocol";

export type WebviewRequest =
  | {
      type:
        | "ready"
        | "newChat"
        | "pickContext"
        | "openSettings"
        | "createBranch"
        | "selectPermissionMode"
        | "cancel"
        | "clearLocalData"
        | "resumeLatest"
        | "forgetSession"
        | "copyDiagnostics"
        | "signIn"
        | "openInCli"
        | "setAnalyze"
        | "manageSessions"
        | "manageSkills"
        | "manageMcp"
        | "manageTaste"
        | "manageMods"
        | "openMemory"
        | "forkSession"
        | "renameSession"
        | "rewindSession"
        | "manageWorktrees"
        | "refreshStatus"
        | "previewContext";
    }
  | { type: "selectModel"; model: string }
  | { type: "removeContext"; file: string }
  | { type: "openFile"; path: string }
  | { type: "openDiff"; path: string }
  | { type: "copy"; text: string }
  | { type: "openExternal"; url: string }
  | {
      type: "prompt";
      text: string;
      model: string;
      effort?: "low" | "medium" | "high";
    };

export function parseWebviewRequest(
  value: unknown,
): WebviewRequest | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  const simple = new Set([
    "ready",
    "newChat",
    "pickContext",
    "openSettings",
    "createBranch",
    "selectPermissionMode",
    "cancel",
    "clearLocalData",
    "resumeLatest",
    "forgetSession",
    "copyDiagnostics",
    "signIn",
    "openInCli",
    "setAnalyze",
    "manageSessions",
    "manageSkills",
    "manageMcp",
    "manageTaste",
    "manageMods",
    "openMemory",
    "forkSession",
    "renameSession",
    "rewindSession",
    "manageWorktrees",
    "refreshStatus",
    "previewContext",
  ]);
  if (simple.has(value.type)) return { type: value.type } as WebviewRequest;
  if (value.type === "selectModel" && isShortString(value.model, 300))
    return { type: value.type, model: value.model };
  if (value.type === "removeContext" && isShortString(value.file, 2_000))
    return { type: value.type, file: value.file };
  if (
    value.type === "openFile" &&
    isShortString(value.path, 4_000) &&
    value.path.length > 0
  )
    return { type: value.type, path: value.path };
  if (
    value.type === "openDiff" &&
    isShortString(value.path, 4_000) &&
    value.path.length > 0
  )
    return { type: value.type, path: value.path };
  if (value.type === "copy" && isShortString(value.text, 200_000))
    return { type: value.type, text: value.text };
  if (
    value.type === "openExternal" &&
    isShortString(value.url, 2_000) &&
    /^https:\/\//i.test(value.url)
  ) {
    return { type: value.type, url: value.url };
  }
  if (
    value.type === "prompt" &&
    isShortString(value.text, 200_000) &&
    isShortString(value.model, 300)
  ) {
    const effort = ["low", "medium", "high"].includes(String(value.effort))
      ? (value.effort as "low" | "medium" | "high")
      : undefined;
    return { type: value.type, text: value.text, model: value.model, effort };
  }
  return undefined;
}

function isShortString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum;
}
