import { type ChildProcessWithoutNullStreams } from "node:child_process";
import { mapExitCode, redactDiagnostic, type ActionableError } from "./errors";
import {
  NdjsonParser,
  ProtocolError,
  cleanCliMessage,
  type CommandCodeFrame,
} from "./protocol";
import {
  ProcessSupervisor,
  type SupervisorTimeouts,
} from "./processSupervisor";
import type { CliInvocation } from "./discovery";

export interface ClientRunOptions {
  invocation: CliInvocation;
  args: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  generation: number;
  timeouts?: SupervisorTimeouts;
  maxEvents?: number;
}

export interface ClientCallbacks {
  onFrame(frame: CommandCodeFrame, generation: number): void;
  onDiagnostic?(message: string): void;
}

export interface ClientRunResult {
  generation: number;
  cancelled: boolean;
  finalReceived: boolean;
  error?: ActionableError;
}

export class CommandCodeClient {
  private supervisor?: ProcessSupervisor;
  private child?: ChildProcessWithoutNullStreams;
  private cancelled = false;

  get running(): boolean {
    return Boolean(this.child);
  }

  async run(
    options: ClientRunOptions,
    callbacks: ClientCallbacks,
  ): Promise<ClientRunResult> {
    if (this.child) throw new Error("CommandCode is already running.");
    this.cancelled = false;
    const parser = new NdjsonParser();
    const supervisor = new ProcessSupervisor(options.timeouts);
    this.supervisor = supervisor;
    let stderr = "";
    let failure = "";
    let finalReceived = false;
    let eventCount = 0;

    return new Promise((resolve) => {
      const timeout = (kind: keyof SupervisorTimeouts) => {
        failure =
          kind === "startupMs"
            ? "CommandCode did not start in time."
            : kind === "inactivityMs"
              ? "CommandCode stopped producing output."
              : "CommandCode exceeded the maximum run time.";
        void supervisor.stop();
      };
      let child: ChildProcessWithoutNullStreams;
      try {
        child = supervisor.start(
          options.invocation.command,
          [...options.invocation.prefixArgs, ...options.args],
          {
            cwd: options.cwd,
            env: { ...(options.env ?? process.env), NO_COLOR: "1" },
          },
          timeout,
        );
      } catch (error) {
        resolve({
          generation: options.generation,
          cancelled: false,
          finalReceived: false,
          error: mapExitCode(null, String(error)),
        });
        return;
      }
      this.child = child;
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      const consume = (frames: CommandCodeFrame[]) => {
        for (const frame of frames) {
          eventCount += 1;
          if (eventCount > (options.maxEvents ?? 10_000))
            throw new ProtocolError("CommandCode emitted too many events.");
          if (frame.type === "result") finalReceived = true;
          callbacks.onFrame(frame, options.generation);
        }
      };
      child.stdout.on("data", (chunk: string) => {
        supervisor.noteOutput(timeout);
        try {
          consume(parser.push(chunk));
        } catch (error) {
          failure = String(error instanceof Error ? error.message : error);
          void supervisor.stop();
        }
      });
      child.stderr.on("data", (chunk: string) => {
        supervisor.noteOutput(timeout);
        stderr = `${stderr}${chunk}`.slice(-12_000);
      });
      child.on("error", (error) => {
        failure = error.message;
      });
      child.on("close", (code) => {
        try {
          consume(parser.finish());
        } catch (error) {
          failure = String(error instanceof Error ? error.message : error);
        }
        callbacks.onDiagnostic?.(
          redactDiagnostic(
            `CommandCode exit=${code}; ${cleanCliMessage(stderr)}`,
          ),
        );
        this.child = undefined;
        this.supervisor = undefined;
        const error =
          !this.cancelled && !finalReceived
            ? mapExitCode(code, failure || cleanCliMessage(stderr))
            : undefined;
        if (error && failure) error.message = failure;
        resolve({
          generation: options.generation,
          cancelled: this.cancelled,
          finalReceived,
          error,
        });
      });
    });
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    await this.supervisor?.stop();
  }
}
