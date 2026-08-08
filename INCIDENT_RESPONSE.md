# Incident response

## Triage

Preserve logs without collecting prompts/source, identify affected extension and CLI versions, stop publication, rotate affected credentials, and assign severity/owner. Communicate through the publisher's verified security channel.

## Scenarios

- **Compromised release:** revoke affected GitHub credentials, remove unsafe release assets, preserve an incident record, publish a clean version under a new tag, notify testers, and audit repository and Actions access. Never silently replace a versioned VSIX.
- **Credential leak:** revoke immediately, remove from history/artifacts/caches, audit usage, and rotate downstream credentials.
- **Permission regression:** halt rollout, instruct users to disable Agent mode or the extension, ship a preview fix, independently verify Plan and per-turn authorization, then promote.
- **Bad auto-update:** stop staged rollout, restore the last known-good package, publish rollback instructions, preserve compatible state migrations, and monitor support signals.

## Recovery and learning

Verify clean-profile installation, process cancellation, trust/mode boundaries, package contents, and dependency audit. Publish a concise incident summary after containment and track corrective actions to closure.
