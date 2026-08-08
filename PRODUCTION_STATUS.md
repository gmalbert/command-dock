# Production implementation status

Reviewed: August 8, 2026
Candidate: `command-dock-0.1.0.vsix`
SHA-256: `E3E6522AFB9AEC9181FA15FCB57AFD5AF6362E58D7A3BD20AC961557DAA516CD`
Decision: **locally verified for GitHub beta staging; tag publication awaits hosted CI and owner review**

This status records evidence for the independent GitHub pre-release path in [BETA_DISTRIBUTION.md](BETA_DISTRIBUTION.md). The detailed internal production-readiness audit is intentionally excluded from the public repository. “Complete” means there is source or local test evidence; it does not substitute for hosted CI or independent review.

## Phase 1 — security boundary: complete locally

- Machine-scoped absolute CLI override; relative, missing, symlinked, workspace-local, and unsupported targets are rejected.
- Untrusted and virtual workspaces are disabled in the manifest and checked again before CLI and Git operations.
- Command Code project trust is explicit. Agent authority is per turn, never persisted, visible in the turn trail, and automatically resets to Analyze.
- Structured transcript persistence, safe DOM rendering, strict CSP/nonces, bounded host/webview contracts, bounded NDJSON, sanitized environment inheritance, path validation, and redacted diagnostics are implemented.
- Threat model, security policy, incident response, privacy disclosure, and support process exist.

Remaining gate: an independent person must review and sign the threat model and Agent permission regression test.

## Phase 2 — client foundation: complete locally

- Strict TypeScript modules cover discovery, security, protocol parsing, models, process supervision, errors, Git validation, contracts, and transcript migration. The view provider is checked JavaScript and uses those modules.
- CLI 1.15.0+ is enforced. Known npm/pnpm/user/Homebrew paths and PATH fallback are supported without a shell.
- Startup, inactivity, and total timeouts are enforced; cancellation and shutdown terminate the process tree; generation IDs suppress stale results.
- Exit codes, safe session linkage, explicit resume/forget/open-CLI actions, sign-in routing, dynamic model catalog, cache/version fallback, and forward-compatible event handling are implemented.

## Phase 3 — testing: local suite complete; hosted matrix pending

- Clean `npm ci --ignore-scripts` passed.
- Strict compile/host typecheck, syntax checks, ESLint, and Prettier passed.
- 36 unit tests passed with 93.24% statements, 78.83% branches, 97.82% functions, and 93.24% lines.
- Five VS Code 1.132 extension-host tests passed: activation/unique commands, manifest trust/view declarations, focusing the real view, idle New Chat/cancellation, and the missing-CLI status path.
- A local Playwright webview smoke passed for completed-state controls, semantic table headers/rows, syntax-token spans, and the exact code-copy payload; the screenshot is retained under the excluded `output/` test evidence directory.
- The deterministic fake CLI covers successful NDJSON, malformed output, and cancellation without accounts or credits.
- The opt-in authenticated live smoke passed using Command Code CLI 1.15.0, a synthetic read-only prompt, and no session persistence.
- `npm audit --audit-level=high` returned zero vulnerabilities.
- CI defines Windows, Linux, and macOS jobs against VS Code Stable and 1.95.0.

Remaining gates: run and retain the hosted OS/version matrix; manually test reload/model/context/New Chat flows, remote hosts, detached/bare/worktree/submodule Git cases, untrusted workspaces, and a clean machine without the CLI.

## Phase 4 — product UX: preview scope complete

- Safe Markdown/code rendering, semantic tables, DOM-only accessible syntax highlighting, exact copy actions, tool progress, reported targets, Open File/Open Changes, elapsed time, usage, retry/edit/regenerate/cancel/interrupted/offline states, visible per-turn model/effort/mode/context, and active-run New Chat confirmation are implemented.
- Dynamic model search, favorites, recents, provider grouping, capability badges, reasoning effort, vision gating, and locally routed slash commands are implemented.
- Context supports scalable cancellable workspace search, multi-root files, explicit folders, active/open editors and selections, diagnostics, per-repository Git diff, supported images, exact preview, individual removal, missing-file validation, real-path containment, and bounded/sensitive-content warnings.
- Git branch creation supports multi-repository selection, canonical validation, conflict/dirty-tree checks, and post-checkout confirmation.
- Session fork/rename/rewind/history plus worktree/mods/memory/taste/skills/MCP management route to the real Command Code CLI rather than dummy controls.
- Keyboard focus, listbox movement, focus return, reduced motion, forced colors, status announcements, and non-color indicators are implemented in the webview.

Documented preview limitations: integrated-terminal selection, granular per-tool approval, transactional Keep/Revert, checkpoint restore, full session CRUD in the webview, and localization. These require upstream protocol or post-preview product work; see [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## Phase 5 — platform and coexistence: implementation complete; manual matrix pending

- The extension uses unique `commandDock.*` view/command/state identifiers, never disables other extensions, and detects the official Command Code extension with a coexistence notice.
- It runs as a workspace extension, so WSL/SSH/Dev Container/Codespaces behavior and CLI installation location are explicit.
- Per-window session/context keys prevent collisions across simultaneous VS Code windows.
- A local combined-profile run activated this extension, the official Command Code extension, and Kilo Code together; five CommandDock integration assertions still passed. The test VS Code build reports Copilot Chat 0.60.0 as built in but does not expose it to extension-host tests, so Copilot remains a manual gate.

Remaining gate: manually run the signed candidate with GitHub Copilot Chat, Kilo Code, and the official Command Code extension enabled in local and representative remote workspaces.

## Phase 6 — independent identity and beta packaging: artifact complete

- The package is now `CommandDock`, publisher `gmalbert`, identifier `gmalbert.command-dock`, with a distinct `commandDock.*` namespace, original terminal-and-dock artwork, and an explicit unaffiliated-project disclaimer.
- Package metadata, 256×256 PNG icon, owner-approved MIT license, README, changelog, beta distribution guide, privacy, support, security, known limitations, and release/rollback procedures are present.
- `vsce ls` reports 26 extension payload files; `vsce package --pre-release` produced a 28-entry, 68.38 KB VSIX including archive metadata. The package excludes source, tests, scripts, maps, declarations, coverage, browser-smoke evidence, local profiles, private documentation, and development configuration.
- The packaged text was scanned for common credential/private-key patterns with no findings.
- The VSIX installed successfully into an isolated VS Code 1.132 profile and listed as `gmalbert.command-dock@0.1.0`.
- A GitHub tag workflow runs the full verification suite, builds the VSIX, creates a SHA-256 checksum, uploads the verified pair as workflow artifacts, and creates a GitHub pre-release. It contains no Marketplace or Azure publishing credentials.

Remaining gates: push the renamed source, retain a green hosted matrix, obtain an independent security review, enable GitHub security reporting, and smoke-test the workflow-built release artifact.

## Phase 7 — GitHub beta: staging pending

Do not push the release tag until the remaining GitHub beta gates are recorded in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). The first distribution should be `v0.1.0-beta.1` to a small tester group, with manual upgrades and a named rollback owner.
