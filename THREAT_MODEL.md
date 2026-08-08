# Threat model

## Assets

Workspace source and Git state, local files reachable by the VS Code account, shell/network authority, Command Code credentials and credits, prompts/transcripts, session identifiers, and extension publishing credentials.

## Trust boundaries

1. Workspace content and settings → extension host.
2. Webview messages/state → extension host.
3. Extension host arguments/environment → CLI process.
4. CLI NDJSON/stderr → extension host and webview.
5. Extension package/publishing workflow → user update channel.

## Primary threats and controls

- **Malicious repository selects an executable:** CLI path is machine-scoped, ignored in untrusted workspaces, absolute, type-checked, real-pathed, and rejects symlinks.
- **Silent write authority:** Analyze maps to Plan; Agent is per-turn, modal, visible, audited in UI activity, and resets.
- **Webview injection/persistent XSS:** strict CSP, local resources, nonce scripts, typed bounded messages, DOM `textContent`, structured versioned persistence, HTTPS-only external links.
- **Protocol/memory denial of service:** line, buffer, event, transcript, activity, stderr, and text limits plus startup/inactivity/total timeouts.
- **Orphaned tools:** group/process-tree termination on stop, reload, new chat, timeout, and deactivate.
- **Session confusion:** workspace-scoped session links, explicit resume/forget, generation IDs, and stale-event suppression.
- **Secret leakage:** no prompt/source/raw environment logs, redacted diagnostics, reviewed-copy workflow, minimal package allowlist.
- **Supply-chain release compromise:** pinned dependencies/lockfile, zero-known-vulnerability audit gate, minimal VSIX inspection, restricted CI permissions, protected Entra publishing identity, staged pre-release channel, documented rollback.

## Residual risks

Agent mode intentionally gives Command Code auto-accept write and shell authority for one turn. The CLI and selected model services remain separate trusted components. Plan mode behavior depends on the minimum compatible CLI. A compromised GitHub maintainer account or Actions workflow can ship malicious beta assets, so repository access, immutable versioned releases, checksums, and incident response remain part of the trust boundary.

## Required independent review

Before public publication, a reviewer other than the implementer must test these boundaries and sign the security gate in `RELEASE_CHECKLIST.md`. Automated tests do not replace that review.
