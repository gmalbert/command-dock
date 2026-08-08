# CommandDock for VS Code

CommandDock is an independent VS Code chat interface for compatible Command Code CLI installations. It adds a dedicated Activity Bar experience while keeping other chat extensions enabled.

> **Unofficial beta:** CommandDock is an independent community project. It is not affiliated with, endorsed by, sponsored by, or published by Command Code. Command Code is a separately installed backend and retains its own terms, privacy policy, account requirements, and service operation.

## What it does

- Runs real Command Code sessions and streams tool progress and responses.
- Loads the model catalog from your installed CLI, including provider and capability metadata.
- Starts in **Analyze** mode, mapped to Command Code's read-only `plan` permission.
- Offers per-turn **Agent** authorization for file edits and shell commands, then returns to Analyze.
- Attaches explicit workspace files, resumes a linked Command Code session, and creates Git branches.
- Attaches the active file/selection, open editors, diagnostics, per-repository Git diffs, files, explicit workspace folders, and supported images with visible, removable context chips and an exact context preview.
- Renders bounded, structured transcripts with safe Markdown, semantic tables, accessible syntax highlighting, and exact code-block copying.
- Shows expandable tool cards, elapsed time, reported targets, workspace-constrained Open File actions, and Git Open Changes routing.
- Supports retry after errors plus edit-and-resend and regenerate actions for completed turns.
- Provides model search, favorites, recent models, provider grouping, capability badges, and reasoning effort when the CLI supports them.
- Routes `/plan`, `/review`, `/model`, `/sessions`, `/fork`, `/rename`, `/rewind`, `/worktree`, `/skills`, `/mcp`, `/mods`, `/memory`, `/taste`, and `/status` without sending unsupported slash text to the model.
- Supports cancellation, timeouts, redacted diagnostics, Workspace Trust, and CLI version checks.

## Requirements

- VS Code 1.95 or newer.
- A trusted local or remote filesystem workspace. Virtual workspaces are not supported.
- Command Code CLI 1.15.0 or newer installed in the environment where the workspace extension host runs.
- A Command Code account for model requests.

Install and authenticate the CLI:

```sh
npm install -g command-code
cmd login
cmd status
```

See the [Command Code quickstart](https://commandcode.ai/docs/quickstart) for other installation options.

## Install the GitHub beta

1. Open the latest pre-release on the [CommandDock releases page](https://github.com/gmalbert/command-dock/releases).
2. Download `command-dock-<version>.vsix` and its `.sha256` checksum.
3. Optionally verify the checksum with `Get-FileHash` on Windows or `sha256sum` on macOS/Linux.
4. In VS Code, open **Extensions**, select the `…` menu, choose **Install from VSIX…**, and select the download.
5. Reload VS Code when prompted.

You can also install from a terminal:

```sh
code --install-extension command-dock-0.1.0.vsix
```

GitHub beta installations do not update automatically. Download and install each newer pre-release manually. See [BETA_DISTRIBUTION.md](BETA_DISTRIBUTION.md) for verification, upgrades, and removal.

## Getting started

1. Open a folder in VS Code and trust it after reviewing its contents.
2. Select the CommandDock terminal-and-dock icon in the Activity Bar.
3. Confirm the green backend indicator. If it is unavailable, run **CommandDock: Sign In** or configure an absolute CLI path in user settings.
4. Pick a model. The list comes from `cmd --list-models` and follows your account and installed CLI.
5. Keep **Analyze** selected for exploration, or choose **Agent** and authorize the individual mutating turn.
6. Send a prompt. Stop ends the complete CLI process tree.

The selected model is a launch override for the linked session. Model availability and billing depend on Command Code; consult [models](https://commandcode.ai/docs/reference/cli/models) and [pricing and limits](https://commandcode.ai/docs/resources/pricing-limits).

## Permission model

### Analyze

Analyze is the default for new sessions and after reloads, trust changes, failures, and Agent turns. It launches Command Code with `--permission-mode plan`. Command Code documents Plan as read-only: file writes and shell commands are blocked, and MCP tools are unavailable.

### Agent

Agent maps to `--permission-mode auto-accept`. Before each Agent turn, VS Code shows a modal confirmation explaining that Command Code may edit files and run shell commands with the user's VS Code permissions. Those commands may access the network or files outside the workspace if the OS account permits it. Authorization is never persisted and automatically returns to Analyze after the turn.

Headless CLI mode does not expose interactive per-tool approval to this webview. Agent therefore remains explicit, per-turn auto-accept rather than implying granular approvals.

Read the upstream [security and privacy documentation](https://commandcode.ai/docs/resources/security).

## Context and data flow

The composer shows attached context before a request is sent. Use the context preview action to inspect the exact selection, diagnostics, or Git-diff text that will be transmitted. The extension passes:

- your prompt;
- selected model and reasoning-effort override, when chosen;
- relative paths of explicitly attached workspace files;
- bounded text from explicitly attached editor selections, diagnostics, and Git diffs;
- explicit in-workspace folder scopes passed through the CLI's `--add-dir` interface;
- supported image paths only when the selected model advertises vision capability;
- the linked Command Code session identifier;
- the active permission mode and turn limit.

The Command Code process can read workspace files in Analyze and Agent modes. In Agent mode it can also change files and execute tools. Command Code sends model requests over the network. The extension itself adds no analytics or telemetry and does not log prompts, source contents, environment variables, credentials, or raw CLI output.

Webview transcripts are stored by VS Code as bounded structured UI state. The session link, selected context paths, and model preference are stored in VS Code workspace state. Command Code stores its own conversation history and credentials separately; see [PRIVACY.md](PRIVACY.md).

Use **CommandDock: Clear Local Extension Data** to clear the extension's transcript link, attachments, and preferences. It does not delete Command Code CLI history, taste, or credentials.

## Sessions

The extension links a single Command Code session per VS Code workspace and window. A result session ID is saved only after the CLI emits it. Use:

- **CommandDock: Resume Latest Linked Session** to confirm the next prompt will resume it;
- **CommandDock: Forget Linked Session** to unlink it without deleting CLI history;
- **CommandDock: New Chat** to stop the active turn, clear context, and start in Analyze.

Interrupted UI entries are restored as interrupted, never as still running. The backend session can be resumed explicitly.

## Git behavior

Branch creation uses VS Code's built-in Git extension. In multi-repository workspaces, the extension asks which repository to use. Git performs canonical ref validation, existing refs are rejected, dirty working trees require confirmation, and success is shown only after checkout is observed.

## Remote development

The extension is declared as a workspace extension. In WSL, SSH, Dev Containers, and Codespaces, install and authenticate the Command Code CLI in the remote environment. A CLI installed only on your local machine is not visible to the remote extension host.

## Settings

- `commandDock.cliPath`: optional absolute, non-symlinked JavaScript entrypoint or executable. Machine-scoped; workspace settings cannot select an executable.
- `commandDock.maxTurns`: 1–500, default 100.

The extension also checks standard npm, user-local, Homebrew, and `PATH` locations without invoking a shell. Attached and tool-reported paths are resolved to real filesystem paths and rejected if a symlink or junction escapes the workspace.

## Commands

- `CommandDock: Show Chat`
- `CommandDock: New Chat`
- `CommandDock: Sign In`
- `CommandDock: Resume Latest Linked Session`
- `CommandDock: Forget Linked Session`
- `CommandDock: Clear Local Extension Data`
- `CommandDock: Copy Redacted Diagnostics`
- `CommandDock: Open Documentation`
- `CommandDock: Open Privacy Policy`
- `CommandDock: Open Terms of Service`
- `CommandDock: Refresh Backend Status`
- `CommandDock: Open Linked Session in CLI`
- `CommandDock: Manage Sessions`
- `CommandDock: Manage Skills`
- `CommandDock: Manage MCP Servers`
- `CommandDock: Manage Taste`
- `CommandDock: Manage Mods`
- `CommandDock: Manage Memory`
- `CommandDock: Fork Linked Session`
- `CommandDock: Rename Linked Session`
- `CommandDock: Rewind Linked Session`
- `CommandDock: Manage Worktrees`
- `CommandDock: Stop Active Turn`

## Troubleshooting

**No Activity Bar icon:** reload the Extension Development Host or installed extension window and confirm `CommandDock` is enabled for the current remote environment.

**CLI missing or incompatible:** run `cmd --version`; version 1.15.0+ is required. For remote workspaces, run it in the remote VS Code terminal.

**Signed out:** run **CommandDock: Sign In**, complete OAuth, and retry. The CLI may briefly open a local callback server as documented by Command Code.

**A turn stopped:** review the inline error. Startup, inactivity, and total-run timeouts intentionally terminate the complete process tree. Copy redacted diagnostics before opening a support request.

**Model unavailable:** refresh the view after `cmd update`. The picker caches the last valid catalog by CLI version and replaces stale choices when the current catalog loads.

For help, see [SUPPORT.md](SUPPORT.md). Report security issues using [SECURITY.md](SECURITY.md).
Protocol and preview constraints are listed in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## Development and verification

```sh
npm ci --ignore-scripts
npm run check
npm run lint
npm run test:integration
npm run package:list
npm run package
python -m py_compile scripts/*.py
python scripts/release_audit.py
```

CI runs unit and extension-host tests on Windows, Linux, and macOS, audits dependencies, checks packaging, and retains the VSIX artifact. Live tests against a real account remain opt-in and use a synthetic prompt.

## Privacy, security, and license

- [Privacy disclosure](PRIVACY.md)
- [Command Code privacy policy](https://commandcode.ai/privacy)
- [Command Code terms of service](https://commandcode.ai/terms)
- [Security policy](SECURITY.md)
- [Support policy](SUPPORT.md)
- [Changelog](CHANGELOG.md)
- [Known limitations](KNOWN_LIMITATIONS.md)
- [License](LICENSE)

CommandDock is an independent project published by `gmalbert`. Command Code documentation, CLI distribution, account services, and model access are operated separately by Command Code. Command Code, Visual Studio Code, GitHub, and GitHub Copilot are trademarks of their respective owners. References identify interoperability only and do not imply endorsement.
