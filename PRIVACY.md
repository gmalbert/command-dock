# Privacy disclosure

Last updated: August 8, 2026

CommandDock is an independent local VS Code client for the separately installed Command Code CLI. CommandDock is not affiliated with or endorsed by Command Code and has no independent telemetry or analytics endpoint.

## Data processed

When you send a request, the extension gives the local or remote CLI your prompt, selected model, reasoning effort, permission mode, turn limit, linked session ID, and the relative paths or in-workspace folder scopes you explicitly attached. When you explicitly attach an editor selection, diagnostics, or Git diff, the bounded text shown in the context preview is included in the request. Supported image paths are included only for models whose CLI catalog advertises vision. The CLI may read workspace files and local Command Code configuration. In Agent mode it may edit files, run commands, and invoke configured tools or networks.

The CLI connects to Command Code and/or selected model providers for inference and authentication. Command Code documents source code, taste, conversation, credential, network, retention, and CLI telemetry behavior in its [Privacy Policy](https://commandcode.ai/privacy), [Terms of Service](https://commandcode.ai/terms), [Security & Privacy guide](https://commandcode.ai/docs/resources/security), and [telemetry documentation](https://commandcode.ai/docs/troubleshooting/telemetry). The extension does not alter those policies or the CLI's own telemetry configuration.

## Local storage

- VS Code webview state: bounded structured transcript, not raw HTML.
- VS Code workspace state: per-window linked CLI session ID, selected model, and attached relative file/folder paths. Selection, diagnostics, and Git-diff text are kept only in memory and are not restored after reload.
- Extension global state: last validated model catalog, keyed to the CLI.
- Command Code CLI data: managed separately by Command Code, including history under its user configuration directories and authentication credentials.

The extension's Output channel contains only redacted lifecycle diagnostics by default. Prompts, source content, credentials, raw environment variables, and raw CLI event payloads are excluded.

## Deletion

Run **CommandDock: Clear Local Extension Data** to remove data owned by this extension for the current workspace. Run **CommandDock: Forget Linked Session** to unlink a session without deleting it. These commands do not delete Command Code CLI credentials, histories, taste profiles, skills, MCP configuration, or server-side account data. Follow Command Code documentation for those operations.

## Telemetry

This release sends no telemetry of its own. The separately installed Command Code CLI has its own documented telemetry behavior and controls. If extension-owned telemetry is introduced later, it must respect applicable VS Code telemetry controls, exclude prompts/source code/paths/credentials, and be disclosed here before release.

Questions may be submitted through [CommandDock issues](https://github.com/gmalbert/command-dock/issues) without secrets, private source code, or personal data. Security reports must use the private process in [SECURITY.md](SECURITY.md).
