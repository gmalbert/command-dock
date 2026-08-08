# Changelog

All notable changes use [Keep a Changelog](https://keepachangelog.com/) conventions.

## [Unreleased]

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
- Read-only Analyze mode and per-turn Agent authorization.
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
