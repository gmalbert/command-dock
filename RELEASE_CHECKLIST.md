# GitHub beta release checklist

## Automated evidence

- [x] `npm ci --ignore-scripts` (local Windows, August 8, 2026)
- [x] `npm audit --audit-level=high` reports zero findings
- [x] `npm run check` (36 unit tests)
- [x] `npm run lint`
- [ ] `npm run test:integration` on supported OS/version matrix
- [x] Local VS Code 1.132 integration run passed all 5 tests
- [x] Local Playwright webview smoke passed for completed-state controls, semantic tables, syntax-token spans, and exact code-copy payloads
- [x] Authenticated CLI 1.15.0 live read-only smoke passed
- [x] `python -m py_compile scripts/*.py`
- [x] `python scripts/release_audit.py`
- [x] `npm run package:list` reviewed: 26 extension payload files
- [x] `npm run package` produces a 28-entry, 68.38 KB pre-release VSIX including archive metadata
- [x] Packaged text scanned for common secrets/private keys: no findings
- [x] VSIX installed and listed in an isolated VS Code 1.132 profile
- [x] Renamed CommandDock candidate SHA-256 recorded in `PRODUCTION_STATUS.md`
- [ ] Clean Stable profile test without CLI
- [ ] Clean Stable profile test with compatible, authenticated CLI
- [ ] Coexistence test with GitHub Copilot Chat, Kilo Code, and the official Command Code extension enabled
- [x] Partial coexistence smoke: official Command Code + Kilo Code co-activated; CommandDock tests remained green
- [ ] Copilot Chat coexistence in a normal Stable profile (test build hides its built-in Copilot extension)

## Repository and identity

- [x] Public repository created at `gmalbert/command-dock`
- [x] Independent CommandDock name, package ID, command namespace, disclaimer, and original artwork implemented
- [x] GitHub tag workflow builds, verifies, checksums, and creates a pre-release without Marketplace credentials
- [x] MIT license selected and approved by repository owner
- [ ] Main branch protection and Actions permissions reviewed
- [ ] Independent threat-model review completed by: __________ date: __________
- [ ] Agent permission regression test signed by: __________
- [ ] Beta rollout and rollback owner confirmed: __________

## GitHub pre-release

- [ ] Renamed source committed and pushed to `gmalbert/command-dock`
- [ ] Hosted Windows, Linux, and macOS CI passes on the pushed commit
- [ ] Reviewed tag `v0.1.0-beta.1` pushed
- [ ] GitHub pre-release contains the workflow-built VSIX and matching `.sha256`
- [ ] Released artifact installed into a clean profile and smoke-tested
- [ ] GitHub issue reporting and private security advisories are enabled

## Promotion

Publish `v0.1.0-beta.1` as a GitHub pre-release, initially invite a small tester group, monitor installation/activation/support health, and publish fixes under new immutable tags. GitHub VSIX installs update manually. Rollback follows `INCIDENT_RESPONSE.md` and retains state-schema compatibility.
