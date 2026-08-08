export const TRANSCRIPT_VERSION = 1;
export const MAX_TRANSCRIPT_ENTRIES = 200;
export const MAX_TRANSCRIPT_TEXT = 200_000;

export type TranscriptEntry =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      status: "complete" | "error" | "cancelled";
      text: string;
      summary: string;
      error: string;
    };

export interface TranscriptState {
  version: 1;
  transcript: TranscriptEntry[];
}

export function migrateTranscriptState(value: unknown): TranscriptState {
  const record = isRecord(value) ? value : {};
  const entries = Array.isArray(record.transcript) ? record.transcript : [];
  return {
    version: TRANSCRIPT_VERSION,
    transcript: entries
      .slice(-MAX_TRANSCRIPT_ENTRIES)
      .flatMap((entry): TranscriptEntry[] => {
        if (
          !isRecord(entry) ||
          typeof entry.id !== "string" ||
          typeof entry.role !== "string"
        )
          return [];
        if (entry.role === "user" && typeof entry.text === "string") {
          return [
            {
              id: entry.id.slice(0, 100),
              role: "user",
              text: entry.text.slice(0, MAX_TRANSCRIPT_TEXT),
            },
          ];
        }
        if (entry.role !== "assistant") return [];
        const status =
          entry.status === "pending"
            ? "cancelled"
            : ["complete", "error", "cancelled"].includes(String(entry.status))
              ? (entry.status as "complete" | "error" | "cancelled")
              : "error";
        return [
          {
            id: entry.id.slice(0, 100),
            role: "assistant",
            status,
            text: stringValue(entry.text, MAX_TRANSCRIPT_TEXT),
            summary: stringValue(entry.summary, 500),
            error:
              entry.status === "pending"
                ? "Interrupted by reload."
                : stringValue(entry.error, 12_000),
          },
        ];
      }),
  };
}

function stringValue(value: unknown, length: number): string {
  return typeof value === "string" ? value.slice(0, length) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
