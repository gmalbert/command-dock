"""Static, network-free release checks for the CommandDock VS Code package."""

from __future__ import annotations

import json
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_FILES = (
    "README.md",
    "CHANGELOG.md",
    "LICENSE",
    "PRIVACY.md",
    "SECURITY.md",
    "SUPPORT.md",
    "THREAT_MODEL.md",
    "INCIDENT_RESPONSE.md",
    "KNOWN_LIMITATIONS.md",
    "BETA_DISTRIBUTION.md",
    "PRODUCTION_STATUS.md",
    ".vscodeignore",
    "media/commanddock-icon.png",
)


def fail(message: str) -> None:
    raise AssertionError(message)


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def check_manifest() -> None:
    package = json.loads(read("package.json"))
    if package.get("name") != "command-dock" or package.get("publisher") != "gmalbert":
        fail("Independent CommandDock package identity must remain stable")
    if package.get("categories") != ["Machine Learning", "Other"]:
        fail("Marketplace categories must remain valid and reviewed")
    if package.get("license") != "MIT":
        fail("CommandDock must ship under the owner-approved MIT license")
    if package.get("main") != "./dist/extension.js":
        fail("Production entrypoint must use compiled output")
    if package.get("capabilities", {}).get("untrustedWorkspaces", {}).get("supported") is not False:
        fail("Untrusted workspaces must remain disabled")
    setting = package["contributes"]["configuration"]["properties"]["commandDock.cliPath"]
    if setting.get("scope") != "machine":
        fail("CLI executable override must be machine-scoped")
    if not re.fullmatch(r"\d+\.\d+\.\d+", package.get("version", "")):
        fail("Marketplace version must be a three-part SemVer")
    dependencies = package.get("devDependencies", {})
    if any(str(version).startswith(("^", "~", ">", "*")) for version in dependencies.values()):
        fail("Development dependencies must be exactly pinned")


def check_icon() -> None:
    data = (ROOT / "media/commanddock-icon.png").read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        fail("Marketplace icon must be PNG")
    width, height = struct.unpack(">II", data[16:24])
    if width < 128 or height < 128:
        fail(f"Marketplace icon is too small: {width}x{height}")


def check_webview() -> None:
    host = read("extension.js")
    webview = read("media/main.js")
    required_csp = "default-src 'none'"
    if required_csp not in host or "script-src 'nonce-${nonce}'" not in host:
        fail("Webview CSP or script nonce is missing")
    forbidden = ("messages.innerHTML", "insertAdjacentHTML")
    combined = f"{host}\n{webview}"
    for value in forbidden:
        if value in combined:
            fail(f"Forbidden unsafe release pattern found: {value}")
    if "parseWebviewRequest" not in host:
        fail("Extension host must validate webview messages")
    if "Trust in Command Code" not in host or not re.search(r"args\.push\([\"']--trust[\"']\)", host):
        fail("Command Code project trust must be explicit before the trust handoff flag")


def check_docs() -> None:
    for relative in REQUIRED_FILES:
        if not (ROOT / relative).is_file():
            fail(f"Required release file is missing: {relative}")
    readme = read("README.md")
    for phrase in ("Permission model", "Context and data flow", "Remote development", "Clear Local Extension Data"):
        if phrase not in readme:
            fail(f"README section is missing: {phrase}")


def check_package_exclusions() -> None:
    ignored = read(".vscodeignore").splitlines()
    required = {
        "coverage/**",
        "output/**",
        ".playwright-cli/**",
        ".private/**",
        "tests/**",
        "src/**",
        "scripts/**",
        "*.vsix",
        ".release-*/**",
        ".vscode-test*.mjs",
        "PRODUCTION_STATUS.md",
        "GITHUB_BETA_DRAFT.md",
    }
    missing = sorted(required.difference(ignored))
    if missing:
        fail(f"Release artifacts are not excluded from the VSIX: {', '.join(missing)}")


def check_release_workflow() -> None:
    release = read(".github/workflows/release.yml")
    ci = read(".github/workflows/ci.yml")
    for phrase in (
        'tags: ["v*"]',
        "permissions:",
        "contents: write",
        "npm run package",
        "sha256sum",
        "gh release create",
        "--prerelease",
        "command-dock-*.vsix",
        "--code-version",
    ):
        if phrase not in release:
            fail(f"Release workflow is missing: {phrase}")
    for forbidden in ("azure/login", "--azure-credential", "vsce publish"):
        if forbidden in release:
            fail(f"GitHub beta workflow must not publish to Marketplace: {forbidden}")
    if "xvfb-run -a npm run test:integration" not in ci or "--code-version" not in ci:
        fail("Linux extension-host CI must run under xvfb")


def main() -> int:
    checks = (
        check_manifest,
        check_icon,
        check_webview,
        check_docs,
        check_package_exclusions,
        check_release_workflow,
    )
    for check in checks:
        check()
        print(f"PASS {check.__name__}")
    print(f"Release audit passed ({len(checks)} checks).")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"FAIL {error}", file=sys.stderr)
        raise SystemExit(1)
