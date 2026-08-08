# Known limitations

These limitations apply to the `0.1.0` preview candidate. They are intentionally documented instead of being represented by controls that do not have a real backend effect.

## Command Code protocol

- Headless Command Code does not currently expose interactive per-tool approvals to this webview. Agent mode therefore uses explicit, per-turn `auto-accept` consent and immediately returns to Analyze.
- Command Code session archive/deletion and checkpoint data remain owned by the interactive CLI. The extension routes session fork, rename, rewind, and worktree actions to that real CLI rather than maintaining a competing session database.
- Keep/Revert is not shown in the chat because the current headless protocol does not provide a safe transaction or rollback primitive. Tool cards expose reported targets with workspace-constrained Open File and Git Open Changes actions; rewind opens the CLI checkpoint workflow.
- Context is sent as clearly labeled prompt context and CLI workspace/additional-directory arguments because the installed headless CLI does not expose a separate typed attachment channel for every context source.

## VS Code environments

- The extension runs in the workspace extension host. WSL, SSH, Dev Containers, and Codespaces require Command Code to be installed and authenticated remotely.
- Virtual workspaces and untrusted workspaces are disabled.
- The public VS Code API does not expose the user's current integrated-terminal selection to extensions. Active editor selections, diagnostics, Git diff, files, and image attachments are supported.
- Full localization is not included in the preview. English is the supported UI language for `0.1.0`.

## Release process

- GitHub betas use an independent CommandDock identity and original artwork. The maintainer must still approve the license/support policy, protect repository access, and obtain an independent threat-model review before broad promotion.
- CI defines Windows, Linux, and macOS jobs, but a local Windows pass is not evidence that the hosted multi-platform matrix has run.
- GitHub Release screenshots, if added, must use synthetic data captured from the final candidate.

See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for the remaining human and hosted-release gates.
