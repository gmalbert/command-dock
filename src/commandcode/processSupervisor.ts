import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface SupervisorTimeouts {
  startupMs: number;
  inactivityMs: number;
  totalMs: number;
}

export const DEFAULT_TIMEOUTS: SupervisorTimeouts = {
  startupMs: 60_000,
  inactivityMs: 120_000,
  totalMs: 30 * 60_000,
};

export class ProcessSupervisor {
  private child?: ChildProcessWithoutNullStreams;
  private timers: NodeJS.Timeout[] = [];
  private startedOutput = false;
  private stopped = false;

  constructor(
    private readonly timeouts: SupervisorTimeouts = DEFAULT_TIMEOUTS,
  ) {}

  start(
    command: string,
    args: readonly string[],
    options: { cwd: string; env: NodeJS.ProcessEnv },
    onTimeout: (kind: keyof SupervisorTimeouts) => void,
  ): ChildProcessWithoutNullStreams {
    if (this.child)
      throw new Error("A CommandCode process is already running.");
    this.child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.arm("startupMs", this.timeouts.startupMs, onTimeout);
    this.arm("totalMs", this.timeouts.totalMs, onTimeout);
    this.child.once("close", () => this.clear());
    return this.child;
  }

  noteOutput(onTimeout: (kind: keyof SupervisorTimeouts) => void): void {
    this.startedOutput = true;
    this.clearNamed("startupMs");
    this.clearNamed("inactivityMs");
    this.arm("inactivityMs", this.timeouts.inactivityMs, onTimeout);
  }

  async stop(): Promise<void> {
    if (!this.child || this.stopped) return;
    this.stopped = true;
    const child = this.child;
    const pid = child.pid;
    if (!pid) return;
    if (process.platform === "win32") {
      const killer = spawn("taskkill.exe", ["/pid", String(pid), "/T", "/F"], {
        windowsHide: true,
        shell: false,
        stdio: "ignore",
      });
      await new Promise<void>((resolve) =>
        killer.once("close", () => resolve()),
      );
      // taskkill can be unavailable or denied in constrained extension hosts.
      // Always signal the direct child as a fallback so its close event settles.
      if (child.exitCode === null) child.kill("SIGKILL");
    } else {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
      const escalation = setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }, 2_000);
      escalation.unref();
    }
    this.clear();
  }

  private arm(
    name: keyof SupervisorTimeouts,
    delay: number,
    callback: (kind: keyof SupervisorTimeouts) => void,
  ): void {
    const timer = setTimeout(() => callback(name), delay);
    Object.assign(timer, { commandCodeTimerName: name });
    timer.unref();
    this.timers.push(timer);
  }

  private clearNamed(name: keyof SupervisorTimeouts): void {
    this.timers = this.timers.filter((timer) => {
      if (
        (timer as NodeJS.Timeout & { commandCodeTimerName?: string })
          .commandCodeTimerName !== name
      )
        return true;
      clearTimeout(timer);
      return false;
    });
  }

  private clear(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.child = undefined;
  }
}
