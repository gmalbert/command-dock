# CommandDock GitHub beta distribution

CommandDock betas are distributed as installable VSIX files through [GitHub Releases](https://github.com/gmalbert/command-dock/releases). They are not published through, signed by, or automatically updated by the Visual Studio Marketplace.

CommandDock is an independent community project. It is not affiliated with, endorsed by, sponsored by, or published by Command Code. The separately installed Command Code CLI remains subject to its operator's account, service, privacy, telemetry, and model-provider terms.

## Tester requirements

- VS Code 1.95 or newer.
- A trusted local or remote filesystem workspace.
- A compatible Command Code CLI 1.15.0 or newer in the same environment as the VS Code extension host.
- A Command Code account with access to at least one model.

## Download and verify

Each GitHub pre-release contains:

- `command-dock-<version>.vsix`;
- `command-dock-<version>.vsix.sha256`;
- generated release notes.

Verify the download before installing it.

PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 .\command-dock-<version>.vsix
Get-Content .\command-dock-<version>.vsix.sha256
```

macOS or Linux:

```sh
sha256sum -c command-dock-<version>.vsix.sha256
```

The calculated hash must exactly match the checksum. Do not install an artifact obtained from an issue attachment, chat message, mirror, or unofficial fork unless you independently reviewed and built that source.

## Install

In VS Code, open **Extensions**, select the `…` menu, choose **Install from VSIX…**, select the verified file, and reload when prompted.

Alternatively:

```sh
code --install-extension command-dock-<version>.vsix
```

The extension identifier is `gmalbert.command-dock`.

## Upgrade

GitHub-installed VSIX builds do not automatically update. Download and verify the newer pre-release, then install it over the existing version with **Install from VSIX…** or `code --install-extension ... --force`.

Read the release notes and [CHANGELOG.md](CHANGELOG.md) before upgrading. Copy any important conversation content first; webview transcript state is not a durable backup.

## Uninstall and remove local state

Before uninstalling, run **CommandDock: Clear Local Extension Data** if you want to remove CommandDock-owned transcript, context, model preference, and linked-session state. Then uninstall CommandDock from the Extensions view and reload VS Code.

This does not delete Command Code credentials, CLI history, sessions, taste, skills, MCP configuration, or server-side account data. Manage those through the upstream CLI and service.

## Beta support and safety

GitHub betas are evaluation software. Start in Analyze mode, review attached context before sending, use Agent only for a specific turn you are prepared to supervise, and keep source control or another backup.

- Functional problems: [GitHub issues](https://github.com/gmalbert/command-dock/issues)
- Security problems: [private security advisory](https://github.com/gmalbert/command-dock/security/advisories/new)
- Known constraints: [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)
- Data handling: [PRIVACY.md](PRIVACY.md)

Do not include credentials, private source, prompts, `.env` contents, or raw account/session data in public reports.

## Maintainer release procedure

1. Update `package.json` and `CHANGELOG.md`.
2. Run the complete local verification documented in `README.md`.
3. Commit and push the candidate.
4. Push a reviewed tag such as `v0.1.0-beta.1`.
5. GitHub Actions rebuilds and tests the source, creates the VSIX and checksum, and publishes a GitHub pre-release.
6. Install the released artifact—not a local build—into a clean profile and perform the release smoke test.
7. If the artifact is unsafe, delete the release assets, document the incident, and publish a fixed version; never silently replace an existing versioned artifact.
