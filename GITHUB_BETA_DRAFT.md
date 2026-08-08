# GitHub pre-release beta draft

## Release title

CommandDock 0.1.0 beta 1

## Summary

CommandDock is an independent VS Code chat interface for the separately installed Command Code CLI. This first beta provides a dedicated Activity Bar chat, dynamic model selection, explicit workspace context, safe Markdown and code rendering, Git branch controls, session routing, read-only Analyze mode, and per-turn Agent authorization.

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
- Agent is explicit per-turn auto-accept and can edit files or run commands with the user's VS Code permissions.
- Headless mode does not currently expose granular per-tool approval to CommandDock.
- Review [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md), [PRIVACY.md](PRIVACY.md), and [SECURITY.md](SECURITY.md) before testing.

## Feedback

Use [GitHub issues](https://github.com/gmalbert/command-dock/issues) for non-sensitive bugs. Use a [private security advisory](https://github.com/gmalbert/command-dock/security/advisories/new) for vulnerabilities.
