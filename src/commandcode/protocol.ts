export const DEFAULT_MAX_LINE_BYTES = 1024 * 1024;
export const DEFAULT_MAX_BUFFER_BYTES = 2 * 1024 * 1024;

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

export interface EventFrame {
  type: "event";
  event: AgentEvent;
}

export interface ResultFrame {
  type: "result";
  subtype: "success" | "error" | "max_turns" | string;
  sessionId?: string;
  stopReason?: string;
  usage: Record<string, unknown>;
  durationMs: number;
  finalText: string;
  error?: string;
}

export type CommandCodeFrame = EventFrame | ResultFrame;

export class ProtocolError extends Error {
  override readonly name = "ProtocolError";
}

export class NdjsonParser {
  private buffer = "";

  constructor(
    private readonly maxLineBytes = DEFAULT_MAX_LINE_BYTES,
    private readonly maxBufferBytes = DEFAULT_MAX_BUFFER_BYTES,
  ) {}

  push(chunk: string): CommandCodeFrame[] {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer, "utf8") > this.maxBufferBytes) {
      throw new ProtocolError(
        "CommandCode output buffer exceeded the safety limit.",
      );
    }

    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    return lines.flatMap((line) => {
      const frame = parseFrame(line, this.maxLineBytes);
      return frame ? [frame] : [];
    });
  }

  finish(): CommandCodeFrame[] {
    const trailing = this.buffer;
    this.buffer = "";
    const frame = parseFrame(trailing, this.maxLineBytes);
    return frame ? [frame] : [];
  }
}

export function parseFrame(
  line: string,
  maxLineBytes = DEFAULT_MAX_LINE_BYTES,
): CommandCodeFrame | undefined {
  const value = line.trim();
  if (!value) return undefined;
  if (Buffer.byteLength(value, "utf8") > maxLineBytes) {
    throw new ProtocolError(
      "CommandCode output line exceeded the safety limit.",
    );
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    throw new ProtocolError("CommandCode emitted malformed JSON.");
  }

  if (!isRecord(candidate) || typeof candidate.type !== "string") {
    throw new ProtocolError("CommandCode emitted an invalid frame.");
  }

  if (candidate.type === "event") {
    if (
      !isRecord(candidate.event) ||
      typeof candidate.event.type !== "string"
    ) {
      throw new ProtocolError("CommandCode emitted an invalid event frame.");
    }
    return { type: "event", event: candidate.event as AgentEvent };
  }

  if (candidate.type === "result") {
    if (
      typeof candidate.subtype !== "string" ||
      typeof candidate.durationMs !== "number" ||
      !Number.isFinite(candidate.durationMs) ||
      candidate.durationMs < 0 ||
      typeof candidate.finalText !== "string" ||
      candidate.finalText.length > 500_000 ||
      (candidate.sessionId !== undefined &&
        (typeof candidate.sessionId !== "string" ||
          candidate.sessionId.length > 500)) ||
      (candidate.error !== undefined &&
        (typeof candidate.error !== "string" ||
          candidate.error.length > 12_000)) ||
      !isRecord(candidate.usage)
    ) {
      throw new ProtocolError("CommandCode emitted an invalid result frame.");
    }
    return candidate as unknown as ResultFrame;
  }

  // Unknown top-level frames are ignored for forward compatibility.
  return undefined;
}

export function isSafeSessionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{5,199}$/.test(value)
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cleanCliMessage(value: string): string {
  return (
    value
      // ANSI CSI escape matcher. Kept as a string so the source contains no
      // literal control characters and remains friendly to security linters.
      // eslint-disable-next-line no-control-regex -- intentionally strips ANSI CSI sequences.
      .replace(new RegExp("\\u001b\\[[0-?]*[ -/]*[@-~]", "g"), "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-4)
      .join("\n")
  );
}
