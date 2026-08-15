# Changelog

All notable changes use [Keep a Changelog](https://keepachangelog.com/) conventions.

## [Unreleased]

## [0.1.7] - 2026-08-15

### Added

- One-time launch-mode choice when you first open the chat — Analyze, Agent, or YOLO — saved to `commandDock.launchMode` and applied to every new chat. Switch per chat with the shield button or `/analyze`, `/agent`, `/yolo`. YOLO passes `--yolo` to Command Code, skipping its confirmation for file edits and shell commands, and is shown in the composer and turn trail while active.
- Get-started onboarding panel with install, docs, settings, refresh, sign-in, and update actions for missing, error, signed-out, and incompatible CLI states.
- Friendly CLI launch-failure errors with a labeled status pill and actionable buttons (Copy install command, Open Settings, Retry, Resume, Update CLI).
- New Chat now confirms discarding a draft or running turn through a host dialog, and `/plan` works without extra text.
- `/plan`, `/review`, `/analyze`, `/agent`, and `/yolo` are discoverable in the slash popover and placeholder hints.

### Changed

- New chats keep your chosen launch mode instead of resetting to Analyze.
- Documentation now reflects persistent Agent mode and the new launch-mode options.

### Fixed

- `formatCliError` and error mapping no longer clobber friendly launch-failure guidance with raw spawn messages.

## [0.1.6] - 2026-08-11

### Fixed

- Keep healthy Command Code turns alive without production inactivity, event-count, or wall-clock kills, and coalesce high-frequency host/webview progress updates to prevent long streaming runs from overwhelming the UI.

## [0.1.5-beta.1] - 2026-08-09

### Fixed

- Allow real turns to start while the network-backed CLI status indicator is unavailable or still checking; fresh cached signed-out and incompatible results remain enforced.

## [0.1.4-beta.1] - 2026-08-09

### Fixed

- Keep completed turns pending until their final activity update arrives so the Command Code connection indicator stops spinning after a response is rendered.

## [0.1.3-beta.1] - 2026-08-09

### Fixed

- Launch JavaScript CLI installations with their system Node.js 22+ runtime instead of VS Code's embedded Electron runtime, which misparsed status and prompt arguments on Windows.
- Pass the JavaScript CLI entrypoint exactly once for chat turns instead of duplicating it in the final process arguments.

## [0.1.2-beta.1] - 2026-08-08

### Fixed

- Keep the welcome content, suggestions, and composer within narrow VS Code sidebar widths instead of allowing minimum-content overflow to clip the left edge.
- Reuse one structured CLI status check per startup, distinguish timeouts from authentication failures, and open sign-in in a visible terminal only when the account is not already authenticated.

## [0.1.1-beta.1] - 2026-08-08

### Fixed

- Run discovered JavaScript CLI entry points correctly inside VS Code's Electron extension host.
- Allow enough time for a cold Command Code startup before loading the live model catalog, and skip background update checks during status probes.
- Pass the correct `--code-version` option so hosted VS Code integration jobs execute tests instead of printing the test runner version.

### Added

- User-confirmed Command Code CLI updates through a visible VS Code terminal, available from the view toolbar, Command Palette, and `/update`.

## [0.1.0-beta.1] - 2026-08-08

### Added

- Independent CommandDock identity, original terminal-and-dock artwork, and GitHub pre-release beta distribution.
- Dedicated CommandDock Activity Bar chat with real Command Code CLI NDJSON streaming.
- Dynamic installed-CLI model catalog and reasoning capability metadata.
- Read-only Analyze mode and persistent Agent auto-accept mode.
- Structured transcript persistence, safe Markdown, code copying, context removal, Git branch creation, session recovery, and redacted diagnostics.
- Structured editor-selection, diagnostics, Git-diff, multi-root file, and vision-model context with an exact preview and bounded payloads.
- Explicit folder context plus real-path containment that rejects symlink/junction escapes.
- Active/open editor shortcuts and separate Git-diff context for each repository in a multi-root workspace.
- Expandable tool cards with elapsed time, reported targets, workspace-constrained Open File, and Git Open Changes actions.
- Completed-turn edit-and-resend and regenerate actions.
- Model favorites/recents/provider grouping, reasoning effort, and locally routed slash-command discovery.
- Real CLI routing for session fork/rename/rewind, worktrees, mods, memory, skills, MCP, taste, and history.
- Strict protocol, discovery, process supervision, fixture tests, VS Code integration tests, cross-platform CI, and release audit.
- Safe semantic Markdown tables and DOM-only syntax highlighting for common code languages, with browser-smoke coverage for completed turns and exact code-copy payloads.

### Security

- Workspace Trust enforcement, machine-scoped CLI override, non-symlink path validation, no implicit `--trust`, bounded frames/events/transcripts, strict webview contracts, CSP, and process-tree cancellation.
