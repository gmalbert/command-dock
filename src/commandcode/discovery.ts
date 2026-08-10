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
  nodeExecutable?: string;
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
      env,
      nodeExecutable: options.nodeExecutable,
      exists,
      realpath,
    });

  for (const candidate of knownInstallPaths(
    platform,
    env,
    options.homeDir ?? os.homedir(),
  )) {
    if (exists(candidate))
      return invocationForFile(candidate, "known-install", {
        platform,
        env,
        nodeExecutable: options.nodeExecutable,
        exists,
        realpath,
      });
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
  options: Pick<
    Required<DiscoveryOptions>,
    "platform" | "exists" | "realpath"
  > &
    Pick<DiscoveryOptions, "env" | "nodeExecutable">,
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
  return invocationForFile(resolved, "setting", {
    platform: options.platform,
    env: options.env ?? process.env,
    nodeExecutable: options.nodeExecutable,
    exists: options.exists,
    realpath: options.realpath,
    alreadyResolved: true,
  });
}

function invocationForFile(
  candidate: string,
  source: CliInvocation["source"],
  options: Pick<
    Required<DiscoveryOptions>,
    "platform" | "env" | "exists" | "realpath"
  > &
    Pick<DiscoveryOptions, "nodeExecutable"> & { alreadyResolved?: boolean },
): CliInvocation {
  const resolved = options.alreadyResolved
    ? candidate
    : options.realpath(candidate);
  const extension = pathForPlatform(options.platform)
    .extname(resolved)
    .toLowerCase();
  if (SCRIPT_EXTENSIONS.has(extension)) {
    return {
      command: resolveNodeExecutable(options),
      prefixArgs: [resolved],
      displayPath: resolved,
      source,
    };
  }
  if (!EXECUTABLE_EXTENSIONS.has(extension))
    throw new Error("Unsupported CommandCode CLI file type.");
  return { command: resolved, prefixArgs: [], displayPath: resolved, source };
}

function resolveNodeExecutable(
  options: Pick<
    Required<DiscoveryOptions>,
    "platform" | "env" | "exists" | "realpath"
  > &
    Pick<DiscoveryOptions, "nodeExecutable">,
): string {
  const platformPath = pathForPlatform(options.platform);
  const executableName = options.platform === "win32" ? "node.exe" : "node";
  const candidates: string[] = [];
  if (options.nodeExecutable) candidates.push(options.nodeExecutable);
  const appData = environmentValue(options.env, "APPDATA", options.platform);
  if (options.platform === "win32" && appData)
    candidates.push(platformPath.join(appData, "npm", executableName));
  const pathValue = environmentValue(options.env, "PATH", options.platform);
  for (const entry of pathValue?.split(platformPath.delimiter) ?? []) {
    const directory = entry.trim().replace(/^"|"$/g, "");
    if (directory)
      candidates.push(platformPath.join(directory, executableName));
  }
  if (!process.versions.electron) candidates.push(process.execPath);

  for (const candidate of candidates) {
    if (!platformPath.isAbsolute(candidate) || !options.exists(candidate))
      continue;
    return options.realpath(candidate);
  }
  throw new Error(
    "A Node.js 22 or newer executable is required to run the CommandCode CLI JavaScript entrypoint.",
  );
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

function environmentValue(
  env: NodeJS.ProcessEnv,
  name: string,
  platform: NodeJS.Platform,
): string | undefined {
  if (env[name] !== undefined) return env[name];
  if (platform !== "win32") return undefined;
  const match = Object.entries(env).find(
    ([key, value]) => key.toUpperCase() === name && value !== undefined,
  );
  return match?.[1];
}

function pathForPlatform(platform: NodeJS.Platform): path.PlatformPath {
  return platform === "win32" ? path.win32 : path.posix;
}
