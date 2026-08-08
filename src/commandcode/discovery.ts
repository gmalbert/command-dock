import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const MINIMUM_CLI_VERSION = "1.15.0";

export interface CliInvocation {
  command: string;
  prefixArgs: string[];
  displayPath: string;
  source: "setting" | "known-install" | "path" | "invalid";
}

export interface DiscoveryOptions {
  configuredPath?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  exists?: (value: string) => boolean;
  realpath?: (value: string) => string;
}

const SCRIPT_EXTENSIONS = new Set([".js", ".cjs", ".mjs"]);
const EXECUTABLE_EXTENSIONS = new Set([".exe", ""]);

export function resolveCliInvocation(
  options: DiscoveryOptions = {},
): CliInvocation {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.exists ?? fs.existsSync;
  const realpath = options.realpath ?? fs.realpathSync;
  const configured = options.configuredPath?.trim();

  if (configured)
    return invocationForTrustedOverride(configured, {
      platform,
      exists,
      realpath,
    });

  for (const candidate of knownInstallPaths(
    platform,
    env,
    options.homeDir ?? os.homedir(),
  )) {
    if (exists(candidate))
      return invocationForFile(
        candidate,
        "known-install",
        realpath,
        false,
        platform,
      );
  }

  return {
    command: platform === "win32" ? "cmdc.cmd" : "cmd",
    prefixArgs: [],
    displayPath: platform === "win32" ? "cmdc.cmd (PATH)" : "cmd (PATH)",
    source: "path",
  };
}

export function invocationForTrustedOverride(
  configured: string,
  options: Pick<Required<DiscoveryOptions>, "platform" | "exists" | "realpath">,
): CliInvocation {
  if (!pathForPlatform(options.platform).isAbsolute(configured))
    throw new Error("The CommandCode CLI override must be an absolute path.");
  if (!options.exists(configured))
    throw new Error("The configured CommandCode CLI path does not exist.");
  const resolved = options.realpath(configured);
  if (
    normalizePath(configured, options.platform) !==
    normalizePath(resolved, options.platform)
  ) {
    throw new Error(
      "The configured CommandCode CLI path must not be a symbolic link.",
    );
  }
  return invocationForFile(
    resolved,
    "setting",
    options.realpath,
    true,
    options.platform,
  );
}

function invocationForFile(
  candidate: string,
  source: CliInvocation["source"],
  realpath: (value: string) => string,
  alreadyResolved: boolean,
  platform: NodeJS.Platform,
): CliInvocation {
  const resolved = alreadyResolved ? candidate : realpath(candidate);
  const extension = pathForPlatform(platform).extname(resolved).toLowerCase();
  if (SCRIPT_EXTENSIONS.has(extension)) {
    return {
      command: process.execPath,
      prefixArgs: [resolved],
      displayPath: resolved,
      source,
    };
  }
  if (!EXECUTABLE_EXTENSIONS.has(extension))
    throw new Error("Unsupported CommandCode CLI file type.");
  return { command: resolved, prefixArgs: [], displayPath: resolved, source };
}

export function knownInstallPaths(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  homeDir: string,
): string[] {
  if (platform === "win32") {
    return [
      env.APPDATA &&
        path.join(
          env.APPDATA,
          "npm",
          "node_modules",
          "command-code",
          "dist",
          "index.mjs",
        ),
      env.LOCALAPPDATA &&
        path.join(env.LOCALAPPDATA, "Programs", "command-code", "cmdc.exe"),
    ].filter((value): value is string => Boolean(value));
  }
  return [
    path.join(homeDir, ".local", "bin", "cmd"),
    "/opt/homebrew/bin/cmd",
    "/usr/local/bin/cmd",
    "/usr/bin/cmd",
  ];
}

export function parseSemver(
  value: string,
): [number, number, number] | undefined {
  const match = value.trim().match(/(?:^|\D)(\d+)\.(\d+)\.(\d+)(?:\D|$)/);
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : undefined;
}

export function isVersionCompatible(
  actual: string,
  minimum = MINIMUM_CLI_VERSION,
): boolean {
  const left = parseSemver(actual);
  const right = parseSemver(minimum);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index]! !== right[index]!) return left[index]! > right[index]!;
  }
  return true;
}

function normalizePath(value: string, platform: NodeJS.Platform): string {
  const normalized = pathForPlatform(platform).normalize(value);
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

function pathForPlatform(platform: NodeJS.Platform): path.PlatformPath {
  return platform === "win32" ? path.win32 : path.posix;
}
