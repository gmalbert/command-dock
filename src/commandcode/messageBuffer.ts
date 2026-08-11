export interface OutboundMessage {
  type: string;
  [key: string]: unknown;
}

export interface TurnMessageBufferOptions {
  delayMs?: number;
  maxDeltaChars?: number;
}

/**
 * Coalesces high-frequency progress and token messages before they cross the
 * extension-host/webview boundary. Terminal messages flush pending progress
 * synchronously so ordering stays deterministic.
 */
export class TurnMessageBuffer {
  private readonly activities = new Map<string, OutboundMessage>();
  private delta = "";
  private timer?: NodeJS.Timeout;
  private readonly delayMs: number;
  private readonly maxDeltaChars: number;

  constructor(
    private readonly post: (message: OutboundMessage) => void,
    options: TurnMessageBufferOptions = {},
  ) {
    this.delayMs = options.delayMs ?? 100;
    this.maxDeltaChars = options.maxDeltaChars ?? 200_000;
  }

  send(message: OutboundMessage): void {
    if (message.type === "activity" && typeof message.id === "string") {
      this.activities.set(message.id, message);
      this.schedule();
      return;
    }
    if (
      message.type === "assistantDelta" &&
      typeof message.text === "string"
    ) {
      this.delta = `${this.delta}${message.text}`.slice(-this.maxDeltaChars);
      this.schedule();
      return;
    }
    this.flush();
    this.post(message);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    for (const activity of this.activities.values()) this.post(activity);
    this.activities.clear();
    if (this.delta) {
      this.post({ type: "assistantDelta", text: this.delta });
      this.delta = "";
    }
  }

  dispose(): void {
    this.flush();
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.delayMs);
    this.timer.unref();
  }
}
