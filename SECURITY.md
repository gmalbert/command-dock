# Security policy

## Supported versions

Only the newest GitHub pre-release beta is supported. Security fixes may require updating both CommandDock and the separately installed Command Code CLI.

## Reporting a vulnerability

Do not open a public issue. Use a [private GitHub security advisory](https://github.com/gmalbert/command-dock/security/advisories/new). Include the affected version, impact, minimal reproduction, and whether exploitation requires Workspace Trust or Agent authorization. Do not include real credentials or unrelated source code.

Target response times:

- acknowledgement: two business days;
- initial severity assessment: five business days;
- critical mitigation or release decision: seven calendar days;
- coordinated disclosure: after a fix is broadly available, normally within 90 days.

## Security boundaries

- Untrusted workspaces cannot activate agent execution.
- Executable overrides are machine-scoped, absolute, existing, non-symlinked supported files.
- Analyze uses Command Code plan mode.
- Agent permission is confirmed per turn and never persisted.
- The webview and CLI are validated, bounded protocol boundaries.
- Child process trees are terminated on cancellation and shutdown.
- Diagnostics redact common secret formats and user home paths and omit raw prompts/source by default.

See [THREAT_MODEL.md](THREAT_MODEL.md) for assumptions and controls.
