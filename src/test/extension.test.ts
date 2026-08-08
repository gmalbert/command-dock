import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import * as vscode from "vscode";

suite("CommandDock extension", () => {
  test("activates and registers uniquely named commands", async () => {
    const extension = vscode.extensions.getExtension("gmalbert.command-dock");
    assert.ok(extension, "development extension should be discoverable");
    await extension.activate();
    assert.equal(extension.isActive, true);
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      "commandDock.focusChat",
      "commandDock.newChat",
      "commandDock.clearLocalData",
      "commandDock.copyDiagnostics",
      "commandDock.openDocs",
      "commandDock.openPrivacy",
      "commandDock.openTerms",
      "commandDock.refreshStatus",
      "commandDock.updateCli",
      "commandDock.signIn",
      "commandDock.resumeLatest",
      "commandDock.forgetSession",
      "commandDock.openInCli",
      "commandDock.manageSessions",
      "commandDock.manageSkills",
      "commandDock.manageMcp",
      "commandDock.manageTaste",
      "commandDock.manageMods",
      "commandDock.openMemory",
      "commandDock.forkSession",
      "commandDock.renameSession",
      "commandDock.rewindSession",
      "commandDock.manageWorktrees",
      "commandDock.cancel",
    ])
      assert.ok(commands.includes(command), `${command} should be registered`);
  });

  test("declares the chat view and workspace trust boundary", () => {
    const extension = vscode.extensions.getExtension("gmalbert.command-dock");
    assert.ok(extension);
    const manifest = extension.packageJSON as Record<string, unknown>;
    assert.equal(
      (manifest.capabilities as { untrustedWorkspaces: { supported: boolean } })
        .untrustedWorkspaces.supported,
      false,
    );
    const contributes = manifest.contributes as {
      views: Record<string, Array<{ id: string }>>;
    };
    assert.equal(contributes.views.commandDock?.[0]?.id, "commandDock.chat");
    assert.deepEqual(manifest.extensionKind, ["workspace"]);
    assert.equal(manifest.preview, true);
    assert.deepEqual(manifest.categories, ["Machine Learning", "Other"]);
    assert.equal(manifest.icon, "media/commanddock-icon.png");
  });

  test("can focus the registered chat view without colliding with other extensions", async () => {
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand("commandDock.focusChat");
    });
  });

  test("New Chat and cancellation commands are safe across an idle view lifecycle", async () => {
    await vscode.commands.executeCommand("commandDock.focusChat");
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand("commandDock.newChat");
      await vscode.commands.executeCommand("commandDock.cancel");
    });
  });

  test("Sign In does not open a terminal for an authenticated CLI", async () => {
    const configuration = vscode.workspace.getConfiguration("commandDock");
    const fixture = path.resolve(
      __dirname,
      "../../tests/fixtures/fake-commandcode.js",
    );
    await configuration.update(
      "cliPath",
      fixture,
      vscode.ConfigurationTarget.Global,
    );
    const terminalCount = vscode.window.terminals.length;
    try {
      await vscode.commands.executeCommand("commandDock.signIn");
      assert.equal(vscode.window.terminals.length, terminalCount);
    } finally {
      await configuration.update(
        "cliPath",
        undefined,
        vscode.ConfigurationTarget.Global,
      );
    }
  });

  test("missing CLI configuration has a safe, actionable status path", async () => {
    const configuration = vscode.workspace.getConfiguration("commandDock");
    const missing = path.join(os.tmpdir(), "missing-commandcode-cli.mjs");
    await configuration.update(
      "cliPath",
      missing,
      vscode.ConfigurationTarget.Global,
    );
    try {
      await assert.doesNotReject(async () => {
        await vscode.commands.executeCommand("commandDock.refreshStatus");
      });
    } finally {
      await configuration.update(
        "cliPath",
        undefined,
        vscode.ConfigurationTarget.Global,
      );
    }
  });

  if (process.env.COMMANDCODE_COEXISTENCE_TEST === "1") {
    test("major coding extensions remain installed beside CommandDock", async () => {
      for (const extensionId of [
        "commandcode.commandcode-vscode",
        "github.copilot-chat",
        "kilocode.kilo-code",
      ])
        assert.ok(
          vscode.extensions.getExtension(extensionId),
          `${extensionId} should remain discoverable`,
        );
      assert.equal(
        vscode.extensions.getExtension("gmalbert.command-dock")?.isActive,
        true,
      );
    });
  }
});
