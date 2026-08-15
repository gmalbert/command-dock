# GitHub pre-release beta draft

## Release title

CommandDock 0.1.5 beta 1

## Summary

CommandDock is an independent VS Code chat interface for the separately installed Command Code CLI. This beta fixes Windows CLI launch failures, decouples real turns from the network-backed status indicator, and ensures completed activity indicators settle correctly while retaining the dedicated Activity Bar chat, dynamic model selection, explicit workspace context, safe Markdown and code rendering, Git branch controls, session routing, read-only Analyze mode, and persistent Agent mode.

CommandDock now launches JavaScript CLI installations with the system Node.js runtime that installed them rather than VS Code's embedded Electron runtime. It also passes the CLI entrypoint only once per chat turn. Together these changes prevent the status-check timeout and `too many arguments` failures seen on Windows.

Completed assistant text now remains associated with its pending turn until the final activity update arrives, preventing the “Command Code connected” indicator from spinning after the response has finished.

Fresh cached signed-out and incompatible results still stop a turn, but a status check that is unavailable or still running no longer blocks the real CLI request from starting and returning its own authoritative result.

The main README now includes complete upgrade instructions for both the CommandDock VSIX and the separately installed Command Code CLI. CommandDock never updates the CLI silently.

CommandDock is not affiliated with, endorsed by, sponsored by, or published by Command Code.

## Requirements

- VS Code 1.95+
- Command Code CLI 1.15.0+ installed in the local or remote extension-host environment
- Authenticated Command Code account and model access
- Trusted filesystem workspace

## Install

1. Download the attached VSIX and checksum.
2. Verify the SHA-256 value.
3. In VS Code choose **Extensions → … → Install from VSIX…**.
4. Reload VS Code and select the CommandDock icon.

Full instructions: [BETA_DISTRIBUTION.md](BETA_DISTRIBUTION.md)

## Safety notes

- Analyze is the default and maps to the CLI's read-only plan permission.
- Agent is a persistent auto-accept mode that can edit files or run commands with the user's VS Code permissions, and returns to Analyze when the user switches it back.
- Headless mode does not currently expose granular per-tool approval to CommandDock.
- Review [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md), [PRIVACY.md](PRIVACY.md), and [SECURITY.md](SECURITY.md) before testing.

## Feedback

Use [GitHub issues](https://github.com/gmalbert/command-dock/issues) for non-sensitive bugs. Use a [private security advisory](https://github.com/gmalbert/command-dock/security/advisories/new) for vulnerabilities.
