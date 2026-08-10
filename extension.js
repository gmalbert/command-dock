// @ts-check
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const {
  cleanCliMessage,
  isSafeSessionId,
} = require("./dist/commandcode/protocol.js");
const {
  buildRunArguments,
  createCliEnvironment,
} = require("./dist/commandcode/security.js");
const {
  resolveCliInvocation,
  MINIMUM_CLI_VERSION,
} = require("./dist/commandcode/discovery.js");
const { classifyCliStatus } = require("./dist/commandcode/status.js");
const { redactDiagnostic } = require("./dist/commandcode/errors.js");
const { parseWebviewRequest } = require("./dist/contracts.js");
const { parseModelList } = require("./dist/commandcode/models.js");
const { CommandCodeClient } = require("./dist/commandcode/client.js");
const { validateBranchName } = require("./dist/git.js");

const CLI_PROBE_TIMEOUT_MS = 60_000;
const CLI_STATUS_CACHE_MS = 30_000;

class CommandDockViewProvider {
  static viewType = "commandDock.chat";

  constructor(context) {
    this.context = context;
    this.extensionUri = context.extensionUri;
    this.view = undefined;
    this.activeProcess = undefined;
    this.windowKey = vscode.env.sessionId || `process-${process.pid}`;
    const sessionLinks = context.workspaceState.get("commandDockSessionLinks", {
      latest: undefined,
      windows: {},
    });
    this.sessionId =
      sessionLinks.windows?.[this.windowKey] ||
      sessionLinks.latest ||
      context.workspaceState.get("commandDockSessionId");
    this.contextStateKey = `contextFiles:${this.windowKey}`;
    this.contextDirectoriesKey = `contextDirectories:${this.windowKey}`;
    this.wasCancelled = false;
    /** @type {'analyze' | 'agent'} */
    this.permissionMode = "analyze";
    this.generation = 0;
    this.client = new CommandCodeClient();
    this.probeProcesses = new Set();
    /** @type {{key: string, checkedAt: number, result: import('./dist/commandcode/status.js').CliStatusResult} | undefined} */
    this.cliStatusCache = undefined;
    /** @type {{key: string, promise: Promise<import('./dist/commandcode/status.js').CliStatusResult>} | undefined} */
    this.cliStatusPromise = undefined;
    /** @type {{key: string, promise: Promise<void>} | undefined} */
    this.modelCatalogPromise = undefined;
    this.turnPending = false;
    this.agentAuthorizedGeneration = undefined;
    this.toolStarts = new Map();
    this.output = vscode.window.createOutputChannel("CommandDock", {
      log: true,
    });
    this.status = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      90,
    );
    this.status.name = "CommandDock";
    this.status.command = "commandDock.focusChat";
    this.status.text = "$(comment-discussion) CommandDock";
    this.status.tooltip = "Show CommandDock";
    this.status.show();
    const cachedCatalog = context.globalState.get("modelCatalog");
    this.models = Array.isArray(cachedCatalog)
      ? cachedCatalog
      : cachedCatalog?.models || MODELS.slice(0, 1);
    context.subscriptions.push(this.output, this.status);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const savedContextFiles = context.workspaceState.get(
      this.contextStateKey,
      context.workspaceState.get("contextFiles", []),
    );
    this.contextFiles = workspaceRoot
      ? savedContextFiles.flatMap((entry) => {
          if (typeof entry === "string")
            return [vscode.Uri.file(path.join(workspaceRoot, entry))];
          const folder = vscode.workspace.workspaceFolders?.find(
            (candidate) => candidate.name === entry?.folder,
          );
          return folder && typeof entry.path === "string"
            ? [vscode.Uri.joinPath(folder.uri, entry.path)]
            : [];
        })
      : [];
    const savedContextDirectories = context.workspaceState.get(
      this.contextDirectoriesKey,
      [],
    );
    this.contextDirectories = workspaceRoot
      ? savedContextDirectories.flatMap((entry) => {
          const folder = vscode.workspace.workspaceFolders?.find(
            (candidate) => candidate.name === entry?.folder,
          );
          return folder && typeof entry.path === "string"
            ? [vscode.Uri.joinPath(folder.uri, entry.path)]
            : [];
        })
      : [];
    this.contextSnippets = [];
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (rawMessage) => {
      const message = parseWebviewRequest(rawMessage);
      if (!message) {
        this.log("warn", "Rejected an invalid webview message.");
        return;
      }
      switch (message.type) {
        case "ready":
          await Promise.all([
            this.postRepositoryState(),
            this.postBackendStatus(),
            this.postContextState(),
          ]);
          break;
        case "newChat":
          this.newChat();
          break;
        case "pickContext":
          await this.pickContext();
          break;
        case "openSettings":
          await vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "commandDock",
          );
          break;
        case "selectModel":
          await this.selectModel(message.model);
          break;
        case "createBranch":
          await this.createBranch();
          break;
        case "selectPermissionMode":
          await this.choosePermissionMode();
          break;
        case "cancel":
          this.cancelTurn();
          break;
        case "copy":
          await vscode.env.clipboard.writeText(String(message.text || ""));
          break;
        case "openExternal":
          await vscode.env.openExternal(vscode.Uri.parse(message.url));
          break;
        case "removeContext":
          await this.removeContext(message.file);
          break;
        case "openFile":
          await this.openWorkspaceFile(message.path);
          break;
        case "openDiff":
          await this.openWorkspaceDiff(message.path);
          break;
        case "clearLocalData":
          await this.clearLocalData();
          break;
        case "resumeLatest":
          await this.resumeLatest();
          break;
        case "forgetSession":
          this.setSessionId(undefined);
          this.view?.webview.postMessage({
            type: "sessionState",
            resumable: false,
          });
          break;
        case "copyDiagnostics":
          await vscode.env.clipboard.writeText(this.diagnostics());
          void vscode.window.showInformationMessage(
            "Redacted CommandDock diagnostics copied.",
          );
          break;
        case "signIn":
          await this.signIn();
          break;
        case "openInCli":
          this.openCliSurface(
            this.sessionId ? ["--resume", this.sessionId] : [],
          );
          break;
        case "setAnalyze":
          this.permissionMode = "analyze";
          this.view?.webview.postMessage({
            type: "permissionModeSelected",
            mode: "analyze",
          });
          break;
        case "manageSessions":
          this.openCliSurface(["--resume"]);
          break;
        case "manageSkills":
          this.openCliSurface(["skills"]);
          break;
        case "manageMcp":
          this.openCliSurface(["mcp"]);
          break;
        case "manageTaste":
          this.openCliSurface(["taste"]);
          break;
        case "manageMods":
          this.openCliSurface(["mods"]);
          break;
        case "openMemory":
          this.openInteractiveSession("/memory");
          break;
        case "forkSession":
          this.forkSession();
          break;
        case "renameSession":
          await this.renameSession();
          break;
        case "rewindSession":
          this.openInteractiveSession("/rewind");
          break;
        case "manageWorktrees":
          this.openInteractiveSession("/worktree");
          break;
        case "refreshStatus":
          await this.postBackendStatus({ force: true });
          break;
        case "updateCli":
          await this.updateCli();
          break;
        case "previewContext":
          await this.previewContext();
          break;
        case "prompt":
          await this.runCommandCodeTurn(
            message.text,
            message.model,
            message.effort,
          );
          break;
      }
    });
  }

  newChat() {
    this.cancelTurn();
    this.generation += 1;
    this.setSessionId(undefined);
    this.contextFiles = [];
    this.contextDirectories = [];
    this.contextSnippets = [];
    this.permissionMode = "analyze";
    this.agentAuthorizedGeneration = undefined;
    void this.context.workspaceState.update(this.contextStateKey, []);
    void this.context.workspaceState.update(this.contextDirectoriesKey, []);
    this.view?.webview.postMessage({
      type: "permissionModeSelected",
      mode: "analyze",
    });
    this.view?.webview.postMessage({ type: "contextUpdated", files: [] });
    this.view?.webview.postMessage({ type: "newChat" });
  }

  async cancelTurn() {
    if (!this.activeProcess) return;
    this.wasCancelled = true;
    this.generation += 1;
    await this.client.cancel();
    this.setRunActive(false);
    this.view?.webview.postMessage({
      type: "activity",
      id: "run",
      label: "Stopping Command Code",
      detail: "",
      status: "running",
    });
  }

  setSessionId(sessionId) {
    const previous = this.sessionId;
    this.sessionId = sessionId;
    const links = this.context.workspaceState.get("commandDockSessionLinks", {
      latest: undefined,
      windows: {},
    });
    const windows = { ...(links.windows || {}) };
    if (sessionId) windows[this.windowKey] = sessionId;
    else delete windows[this.windowKey];
    const latest =
      sessionId || (links.latest === previous ? undefined : links.latest);
    void Promise.all([
      this.context.workspaceState.update("commandDockSessionLinks", {
        latest,
        windows,
      }),
      this.context.workspaceState.update("commandDockSessionId", undefined),
    ]);
  }

  dispose() {
    this.wasCancelled = true;
    this.generation += 1;
    void this.client.cancel();
    for (const child of this.probeProcesses) child.kill();
    this.probeProcesses.clear();
    this.activeProcess = undefined;
    this.setRunActive(false);
  }

  setRunActive(active) {
    void vscode.commands.executeCommand(
      "setContext",
      "commandDock.runActive",
      active,
    );
    this.status.text = active
      ? "$(loading~spin) CommandDock"
      : "$(comment-discussion) CommandDock";
    this.status.tooltip = active
      ? "Command Code is running — open CommandDock to review or stop"
      : "Show CommandDock";
  }

  log(level, value) {
    this.output[level]
      ? this.output[level](redactDiagnostic(String(value)))
      : this.output.appendLine(redactDiagnostic(String(value)));
  }

  probeCli(invocation, args, timeoutMs) {
    return probeCli(invocation, args, timeoutMs, (child, active) => {
      if (active) this.probeProcesses.add(child);
      else this.probeProcesses.delete(child);
    });
  }

  clearCliStatusCache() {
    this.cliStatusCache = undefined;
  }

  getCachedCliStatus(invocation) {
    const key = JSON.stringify([invocation.command, invocation.prefixArgs]);
    if (
      this.cliStatusCache?.key === key &&
      Date.now() - this.cliStatusCache.checkedAt < CLI_STATUS_CACHE_MS
    ) {
      return this.cliStatusCache.result;
    }
    return undefined;
  }

  async getCliStatus(invocation, { force = false } = {}) {
    const key = JSON.stringify([invocation.command, invocation.prefixArgs]);
    if (this.cliStatusPromise?.key === key)
      return this.cliStatusPromise.promise;
    const cached = force ? undefined : this.getCachedCliStatus(invocation);
    if (cached) return cached;

    const promise = this.probeCli(
      invocation,
      ["status", "--json", "--no-auto-update"],
      CLI_PROBE_TIMEOUT_MS,
    ).then((probe) => classifyCliStatus(probe, MINIMUM_CLI_VERSION));
    this.cliStatusPromise = { key, promise };
    try {
      const result = await promise;
      if (result.kind === "error") {
        this.cliStatusCache = undefined;
        this.log("warn", `CLI status check failed: ${result.message}`);
      } else {
        this.cliStatusCache = { key, checkedAt: Date.now(), result };
      }
      return result;
    } finally {
      if (this.cliStatusPromise?.promise === promise)
        this.cliStatusPromise = undefined;
    }
  }

  async refreshModelCatalog(invocation, version) {
    const key = JSON.stringify([invocation.command, invocation.prefixArgs]);
    if (this.modelCatalogPromise?.key === key)
      return this.modelCatalogPromise.promise;
    const promise = (async () => {
      const catalog = await this.probeCli(
        invocation,
        ["--list-models", "--no-auto-update"],
        CLI_PROBE_TIMEOUT_MS,
      );
      if (!catalog.ok) {
        this.log("warn", `Model catalog check failed: ${catalog.error}`);
        return;
      }
      const models = parseModelList(catalog.stdout);
      if (!models.length) return;
      this.models = [
        {
          id: "auto",
          label: "Auto",
          description: "Best available model for the task",
          provider: "Command Code",
          capabilities: [],
        },
        ...models,
      ];
      await this.context.globalState.update("modelCatalog", {
        version,
        models: this.models,
      });
      this.view?.webview.postMessage({
        type: "modelCatalog",
        models: this.models,
      });
    })();
    this.modelCatalogPromise = { key, promise };
    try {
      await promise;
    } finally {
      if (this.modelCatalogPromise?.promise === promise)
        this.modelCatalogPromise = undefined;
    }
  }

  diagnostics() {
    const invocation = this.resolveCliInvocation();
    return redactDiagnostic(
      [
        "CommandDock diagnostics",
        `VS Code: ${vscode.version}`,
        `Platform: ${process.platform} ${process.arch}`,
        `Workspace trusted: ${vscode.workspace.isTrusted}`,
        `CLI: ${invocation.displayPath}`,
        `CLI source: ${invocation.source || "unknown"}`,
        `Session linked: ${Boolean(this.sessionId)}`,
        `Run active: ${Boolean(this.activeProcess)}`,
      ].join("\n"),
    );
  }

  async clearLocalData() {
    await Promise.all([
      this.context.workspaceState.update("commandDockSessionId", undefined),
      this.context.workspaceState.update("commandDockSessionLinks", undefined),
      this.context.workspaceState.update("contextFiles", undefined),
      this.context.workspaceState.update(this.contextStateKey, undefined),
      this.context.workspaceState.update(this.contextDirectoriesKey, undefined),
      this.context.workspaceState.update("selectedModel", undefined),
      this.context.workspaceState.update(
        "commandDockProjectTrusted",
        undefined,
      ),
      this.context.globalState.update("modelCatalog", undefined),
      this.context.globalState.update(
        "officialExtensionNoticeShown",
        undefined,
      ),
    ]);
    this.sessionId = undefined;
    this.contextFiles = [];
    this.contextDirectories = [];
    this.contextSnippets = [];
    this.permissionMode = "analyze";
    this.models = MODELS.slice(0, 1);
    this.newChat();
    this.view?.webview.postMessage({ type: "localDataCleared" });
    void vscode.window.showInformationMessage(
      "CommandDock local session data was cleared.",
    );
  }

  async resumeLatest() {
    if (!this.sessionId) {
      void vscode.window.showInformationMessage(
        "There is no linked Command Code session to resume.",
      );
      return;
    }
    this.view?.webview.postMessage({
      type: "sessionState",
      resumable: true,
      sessionId: this.sessionId.slice(0, 8),
    });
    void vscode.window.showInformationMessage(
      "The next message will resume the linked Command Code session.",
    );
  }

  forkSession() {
    if (!this.sessionId) {
      void vscode.window.showWarningMessage(
        "There is no linked Command Code session to fork.",
      );
      return;
    }
    this.openCliSurface(["--resume", this.sessionId, "--fork-session"]);
  }

  async renameSession() {
    if (!this.sessionId) {
      void vscode.window.showWarningMessage(
        "There is no linked Command Code session to rename.",
      );
      return;
    }
    const name = await vscode.window.showInputBox({
      title: "Rename linked Command Code session",
      prompt: "The real session will be renamed by the Command Code CLI.",
      validateInput: (value) => {
        const clean = value.trim();
        if (!clean) return "Enter a session name.";
        if (clean.length > 100) return "Use 100 characters or fewer.";
        if (/\p{Cc}/u.test(clean)) return "Control characters are not allowed.";
        return undefined;
      },
    });
    if (!name) return;
    this.openCliSurface(["--resume", this.sessionId, "--name", name.trim()]);
  }

  openInteractiveSession(command) {
    this.openCliSurface(this.sessionId ? ["--resume", this.sessionId] : []);
    void vscode.window.showInformationMessage(
      `Command Code opened in the terminal. Run ${command} there.`,
    );
  }

  async signIn() {
    const invocation = this.resolveCliInvocation();
    if (invocation.detected === false) {
      void vscode.window.showErrorMessage(invocation.displayPath);
      return;
    }
    const status = await this.getCliStatus(invocation, { force: true });
    if (status.kind === "ready") {
      void vscode.window.showInformationMessage(
        `Command Code ${status.version} is already signed in.`,
      );
      await this.postBackendStatus();
      return;
    }
    if (status.kind === "incompatible") {
      void vscode.window.showErrorMessage(
        `Update Command Code to ${MINIMUM_CLI_VERSION} or newer before signing in (found ${status.version}).`,
      );
      return;
    }
    if (status.kind === "error")
      void vscode.window.showWarningMessage(
        `${status.message} Opening sign-in in a visible terminal so you can review the result.`,
      );

    const terminal = vscode.window.createTerminal({
      name: "Command Code Sign In",
      shellPath: invocation.command,
      shellArgs: [...invocation.prefixArgs, "login"],
      cwd: os.homedir(),
      env: createInvocationEnvironment(invocation),
    });
    this.refreshAfterTerminalCloses(terminal);
    terminal.show();
    void vscode.window.showInformationMessage(
      "Command Code sign-in opened in a terminal. Complete any instructions shown there.",
    );
  }

  async updateCli() {
    const invocation = this.resolveCliInvocation();
    if (invocation.detected === false) {
      void vscode.window.showErrorMessage(invocation.displayPath);
      return;
    }
    const confirmation = await vscode.window.showWarningMessage(
      "Update the globally installed Command Code CLI? CommandDock will open the official updater in a visible terminal.",
      { modal: true },
      "Open Updater",
    );
    if (confirmation !== "Open Updater") return;
    const terminal = vscode.window.createTerminal({
      name: "Update Command Code",
      shellPath: invocation.command,
      shellArgs: [...invocation.prefixArgs, "update"],
      cwd: os.homedir(),
      env: createInvocationEnvironment(invocation),
    });
    this.refreshAfterTerminalCloses(terminal);
    terminal.show();
    void vscode.window.showInformationMessage(
      "Command Code updater opened. When it finishes, reload VS Code or run “CommandDock: Refresh Backend Status” to reload the model catalog.",
    );
  }

  refreshAfterTerminalCloses(terminal) {
    const subscription = vscode.window.onDidCloseTerminal((closed) => {
      if (closed !== terminal) return;
      subscription.dispose();
      this.clearCliStatusCache();
      void this.postBackendStatus({ force: true });
    });
    this.context.subscriptions.push(subscription);
  }

  openCliSurface(args = []) {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        "Trust this workspace before opening Command Code from the extension.",
      );
      return;
    }
    const invocation = this.resolveCliInvocation();
    if (invocation.detected === false) {
      void vscode.window.showErrorMessage(invocation.displayPath);
      return;
    }
    const terminal = vscode.window.createTerminal({
      name: "Command Code",
      shellPath: invocation.command,
      shellArgs: [...invocation.prefixArgs, ...args],
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri,
      env: createInvocationEnvironment(invocation),
    });
    terminal.show();
  }

  async selectModel(modelId) {
    const model = this.models.find((candidate) => candidate.id === modelId);
    if (!model) return;
    await this.context.workspaceState.update("selectedModel", model.id);
    this.view?.webview.postMessage({ type: "modelSelected", model });
  }

  async choosePermissionMode() {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        "Trust this workspace before enabling Agent mode.",
      );
      return;
    }
    const current = this.permissionMode;
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: "$(search) Analyze",
          description: current === "analyze" ? "Current" : "",
          detail:
            "Read and inspect the workspace. File edits and shell commands are blocked.",
          value: "analyze",
        },
        {
          label: "$(tools) Agent",
          description: current === "agent" ? "Current" : "",
          detail:
            "Allow Command Code to edit files and run shell commands in this workspace.",
          value: "agent",
        },
      ],
      {
        title: "CommandDock permission mode",
        placeHolder: "Choose what the agent may do",
      },
    );
    if (!choice) return;

    if (choice.value === "agent" && current !== "agent") {
      const confirmation = await vscode.window.showWarningMessage(
        "Agent mode allows Command Code to edit files and run shell commands in this workspace.",
        { modal: true },
        "Enable Agent Mode",
      );
      if (confirmation !== "Enable Agent Mode") return;
    }

    this.permissionMode = choice.value === "agent" ? "agent" : "analyze";
    this.view?.webview.postMessage({
      type: "permissionModeSelected",
      mode: choice.value,
    });
  }

  async pickContext() {
    const quickContext = await this.collectQuickContext();
    const quickFilePaths = new Set(
      quickContext
        .filter((item) => item.contextKind === "file")
        .map((item) => item.uri.fsPath.toLowerCase()),
    );
    const files = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Searching workspace files…",
        cancellable: true,
      },
      (_progress, token) =>
        vscode.workspace.findFiles("**/*", undefined, 5_000, token),
    );
    /** @type {any[]} */
    const items = [
      {
        label: "$(folder-opened) Choose folders…",
        description: "Add explicit directory scope",
        contextKind: "folderPicker",
        picked: false,
      },
      ...this.contextDirectories.map((uri) => ({
        label: `${displayContextPath(uri)}/`,
        description: "folder",
        contextKind: "directory",
        uri,
        picked: true,
      })),
      ...quickContext,
      ...files
        .filter(
          (uri) =>
            !isLikelyBinary(uri.fsPath) &&
            !quickFilePaths.has(uri.fsPath.toLowerCase()),
        )
        .map((uri) => ({
          label: displayContextPath(uri),
          description: path.extname(uri.fsPath).slice(1) || "file",
          contextKind: "file",
          uri,
          picked: this.contextFiles.some(
            (entry) => entry.fsPath === uri.fsPath,
          ),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
    const selected = await vscode.window.showQuickPick(items, {
      title: "Add files to CommandDock context",
      placeHolder: "Search workspace files",
      canPickMany: true,
      matchOnDescription: true,
      ignoreFocusOut: true,
    });
    if (!selected) return;
    let selectedDirectories = selected
      .filter((item) => item.contextKind === "directory")
      .map((item) => item.uri);
    if (selected.some((item) => item.contextKind === "folderPicker")) {
      const pickedDirectories = await vscode.window.showOpenDialog({
        title: "Add folders to CommandDock context",
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: true,
        openLabel: "Add folders",
      });
      const outside = (pickedDirectories || []).filter(
        (uri) => !isSafeWorkspaceUri(uri),
      );
      if (outside.length) {
        void vscode.window.showWarningMessage(
          "CommandDock only attaches folders inside the open workspace.",
        );
      }
      selectedDirectories = [
        ...selectedDirectories,
        ...(pickedDirectories || []).filter(isSafeWorkspaceUri),
      ];
    }
    this.contextDirectories = [
      ...new Map(
        selectedDirectories.map((uri) => [uri.fsPath.toLowerCase(), uri]),
      ).values(),
    ];
    const largeFiles = (
      await Promise.all(
        selected
          .filter((item) => item.uri)
          .map(async (item) => {
            try {
              return (await vscode.workspace.fs.stat(item.uri)).size > 5_000_000
                ? item
                : undefined;
            } catch {
              return undefined;
            }
          }),
      )
    ).filter(Boolean);
    const sensitive = selected.filter(
      (item) =>
        item.uri &&
        /(^|[\\/])(?:\.env(?:\.|$)|id_rsa|id_ed25519|.*\.(?:pem|key|p12))$/i.test(
          item.uri.fsPath,
        ),
    );
    const sensitiveSnippets = selected.filter(
      (item) =>
        item.contextKind === "snippet" && containsSensitiveText(item.text),
    );
    if (sensitive.length || sensitiveSnippets.length || largeFiles.length) {
      const proceed = await vscode.window.showWarningMessage(
        `${sensitive.length} selected file path(s) and ${sensitiveSnippets.length} text attachment(s) may contain credentials or private keys; ${largeFiles.length} files exceed 5 MB. Review the context preview before transmitting them.`,
        { modal: true },
        "Attach Anyway",
      );
      if (proceed !== "Attach Anyway") return;
    }
    this.contextFiles = [
      ...new Map(
        selected
          .filter((item) => item.contextKind === "file")
          .map((item) => [item.uri.fsPath.toLowerCase(), item.uri]),
      ).values(),
    ];
    this.contextSnippets = selected
      .filter((item) => item.contextKind === "snippet")
      .map((item) => ({ label: item.label, text: item.text }));
    const relativeFiles = this.contextFiles.map(displayContextPath);
    await this.context.workspaceState.update(
      this.contextStateKey,
      this.contextFiles.map(serializeContextUri).filter(Boolean),
    );
    await this.context.workspaceState.update(
      this.contextDirectoriesKey,
      this.contextDirectories.map(serializeContextUri).filter(Boolean),
    );
    this.view?.webview.postMessage({
      type: "contextUpdated",
      files: [
        ...relativeFiles,
        ...this.contextDirectories.map((uri) => `${displayContextPath(uri)}/`),
        ...this.contextSnippets.map((item) => item.label),
      ],
    });
  }

  async collectQuickContext() {
    const items = [];
    const editor = vscode.window.activeTextEditor;
    const openDocuments = new Map();
    for (const document of vscode.workspace.textDocuments) {
      const uri = document.uri;
      if (uri.scheme !== "file" || !isSafeWorkspaceUri(uri)) continue;
      openDocuments.set(uri.fsPath.toLowerCase(), uri);
    }
    for (const uri of openDocuments.values())
      items.push({
        label: displayContextPath(uri),
        description:
          editor?.document.uri.fsPath === uri.fsPath
            ? "active editor"
            : "open editor",
        contextKind: "file",
        uri,
        picked: this.contextFiles.some((item) => item.fsPath === uri.fsPath),
      });
    if (editor && !editor.selection.isEmpty) {
      const text = editor.document.getText(editor.selection).slice(0, 50_000);
      const label = `Selection: ${displayContextPath(editor.document.uri)}:${editor.selection.start.line + 1}-${editor.selection.end.line + 1}`;
      items.push({
        label,
        description: `${text.length} characters`,
        contextKind: "snippet",
        text,
        picked: this.contextSnippets.some((item) => item.label === label),
      });
    }
    const diagnostics = vscode.languages
      .getDiagnostics()
      .flatMap(([uri, entries]) =>
        entries
          .slice(0, 50)
          .map(
            (entry) =>
              `${displayContextPath(uri)}:${entry.range.start.line + 1}:${entry.range.start.character + 1} ${vscode.DiagnosticSeverity[entry.severity]} ${entry.message}`,
          ),
      )
      .slice(0, 500);
    if (diagnostics.length) {
      items.push({
        label: `Diagnostics (${diagnostics.length})`,
        description: "Problems visible in VS Code",
        contextKind: "snippet",
        text: diagnostics.join("\n").slice(0, 50_000),
        picked: this.contextSnippets.some((item) =>
          item.label.startsWith("Diagnostics ("),
        ),
      });
    }
    const repositories = await this.getGitRepositories();
    for (const repository of repositories) {
      try {
        const diff = String(await repository.diffWithHEAD()).slice(0, 100_000);
        if (diff) {
          const label =
            repositories.length > 1
              ? `Git diff: ${vscode.workspace.asRelativePath(repository.rootUri, false)}`
              : "Git diff";
          items.push({
            label,
            description: `${diff.length} characters from HEAD`,
            contextKind: "snippet",
            text: diff,
            picked: this.contextSnippets.some((item) => item.label === label),
          });
        }
      } catch {
        // Detached or unborn repositories may not have a HEAD diff.
      }
    }
    return items;
  }

  async previewContext() {
    const content = [
      "# CommandDock context preview",
      "",
      "The CLI may read these attached workspace files:",
      ...this.contextFiles.map((uri) => `- ${displayContextPath(uri)}`),
      ...this.contextDirectories.map(
        (uri) => `- ${displayContextPath(uri)}/ (folder scope)`,
      ),
      ...this.contextSnippets.flatMap((item) => [
        "",
        `## ${item.label}`,
        "",
        "```text",
        item.text,
        "```",
      ]),
    ].join("\n");
    const document = await vscode.workspace.openTextDocument({
      language: "markdown",
      content,
    });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  async openWorkspaceFile(requestedPath) {
    const candidate = this.resolveWorkspacePath(requestedPath);
    if (!candidate) return;
    await vscode.window.showTextDocument(candidate, { preview: true });
  }

  async openWorkspaceDiff(requestedPath) {
    const candidate = this.resolveWorkspacePath(requestedPath);
    if (!candidate) return;
    try {
      await vscode.commands.executeCommand("git.openChange", candidate);
    } catch (error) {
      void vscode.window.showWarningMessage(
        `CommandDock could not open Git changes for this file: ${formatCliError(error)}`,
      );
    }
  }

  resolveWorkspacePath(requestedPath) {
    const folders = vscode.workspace.workspaceFolders || [];
    if (!folders.length) return undefined;
    let candidate;
    if (path.isAbsolute(requestedPath)) {
      candidate = vscode.Uri.file(path.resolve(requestedPath));
    } else {
      const normalized = requestedPath.replaceAll("\\", "/");
      const namedFolder = folders.find(
        (folder) =>
          normalized === folder.name ||
          normalized.startsWith(`${folder.name}/`),
      );
      const base = namedFolder || folders[0];
      const relativePath = namedFolder
        ? normalized.slice(namedFolder.name.length).replace(/^\/+/, "")
        : normalized;
      candidate = vscode.Uri.file(path.resolve(base.uri.fsPath, relativePath));
    }
    if (!isSafeWorkspaceUri(candidate)) {
      void vscode.window.showWarningMessage(
        "CommandDock refused to open a path outside the workspace.",
      );
      return undefined;
    }
    return candidate;
  }

  async postContextState() {
    this.view?.webview.postMessage({
      type: "contextUpdated",
      files: [
        ...this.contextFiles.map(displayContextPath),
        ...this.contextDirectories.map((uri) => `${displayContextPath(uri)}/`),
        ...this.contextSnippets.map((item) => item.label),
      ],
    });
  }

  async removeContext(relativeFile) {
    this.contextFiles = this.contextFiles.filter(
      (uri) => displayContextPath(uri) !== relativeFile,
    );
    const files = this.contextFiles.map(displayContextPath);
    this.contextDirectories = this.contextDirectories.filter(
      (uri) => `${displayContextPath(uri)}/` !== relativeFile,
    );
    this.contextSnippets = this.contextSnippets.filter(
      (item) => item.label !== relativeFile,
    );
    await this.context.workspaceState.update(
      this.contextStateKey,
      this.contextFiles.map(serializeContextUri).filter(Boolean),
    );
    await this.context.workspaceState.update(
      this.contextDirectoriesKey,
      this.contextDirectories.map(serializeContextUri).filter(Boolean),
    );
    this.view?.webview.postMessage({
      type: "contextUpdated",
      files: [
        ...files,
        ...this.contextDirectories.map((uri) => `${displayContextPath(uri)}/`),
        ...this.contextSnippets.map((item) => item.label),
      ],
    });
  }

  /** @returns {import('./dist/commandcode/discovery.js').CliInvocation & {detected: boolean}} */
  resolveCliInvocation() {
    const configured = vscode.workspace
      .getConfiguration("commandDock")
      .get("cliPath", "")
      .trim();
    try {
      return {
        ...resolveCliInvocation({ configuredPath: configured }),
        detected: true,
      };
    } catch (error) {
      return {
        command: "",
        prefixArgs: [],
        displayPath: error instanceof Error ? error.message : String(error),
        source: "invalid",
        detected: false,
      };
    }
  }

  async postBackendStatus({ force = false } = {}) {
    const invocation = this.resolveCliInvocation();
    if (invocation.detected !== false) {
      const status = await this.getCliStatus(invocation, { force });
      if (status.kind === "error") {
        this.view?.webview.postMessage({
          type: "backendStatus",
          status: "error",
          label: status.message,
        });
        return;
      }
      if (status.kind === "incompatible") {
        this.view?.webview.postMessage({
          type: "backendStatus",
          status: "incompatible",
          label: `Update Command Code to ${MINIMUM_CLI_VERSION} or newer (found ${status.version}).`,
        });
        return;
      }
      if (status.kind === "signed-out") {
        this.view?.webview.postMessage({
          type: "backendStatus",
          status: "signed-out",
          label: "Command Code sign-in required",
        });
        return;
      }
      this.view?.webview.postMessage({
        type: "backendStatus",
        status: "ready",
        label: `Command Code ${status.version} ready`,
      });
      if (this.turnPending || this.activeProcess) return;
      await this.refreshModelCatalog(invocation, status.version);
      return;
    }
    this.view?.webview.postMessage({
      type: "backendStatus",
      status: invocation.detected === false ? "missing" : "ready",
      label:
        invocation.detected === false
          ? "CLI path not found"
          : "Command Code CLI ready",
    });
  }

  async getGitRepository() {
    const repositories = await this.getGitRepositories();
    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    return (
      repositories.find(
        (repository) =>
          workspaceUri && repository.rootUri.fsPath === workspaceUri.fsPath,
      ) || repositories[0]
    );
  }

  async getGitRepositories() {
    const gitExtension = vscode.extensions.getExtension("vscode.git");
    if (!gitExtension) return [];
    const git = gitExtension.isActive
      ? gitExtension.exports
      : await gitExtension.activate();
    return git.getAPI(1).repositories;
  }

  async chooseGitRepository() {
    const repositories = await this.getGitRepositories();
    if (repositories.length <= 1) return repositories[0];
    /** @type {Array<{label: string, description: string, repository: any}>} */
    const items = repositories.map((repository) => ({
      label: vscode.workspace.asRelativePath(repository.rootUri, false),
      description: repository.state.HEAD?.name || "Detached HEAD",
      repository,
    }));
    const choice = await vscode.window.showQuickPick(items, {
      title: "Choose the repository for the new branch",
    });
    return choice?.repository;
  }

  async postRepositoryState() {
    const repository = await this.getGitRepository();
    if (repository && !this.repositorySubscription) {
      this.repositorySubscription = repository.state.onDidChange(
        () => void this.postRepositoryState(),
      );
      this.context.subscriptions.push(this.repositorySubscription);
    }
    this.view?.webview.postMessage({
      type: "repositoryState",
      branch: repository?.state?.HEAD?.name || null,
      available: Boolean(repository),
    });
  }

  async createBranch() {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        "CommandDock: Trust this workspace before creating a branch.",
      );
      return;
    }
    const repository = await this.chooseGitRepository();
    if (!repository) {
      void vscode.window.showWarningMessage(
        "CommandDock: Open a Git repository before creating a branch.",
      );
      return;
    }

    const name = await vscode.window.showInputBox({
      title: "Create a new branch",
      prompt: `Branch from ${repository.state.HEAD?.name || "current HEAD"}`,
      placeHolder: "feature/short-description",
      ignoreFocusOut: true,
      validateInput: async (value) => {
        const localError = validateBranchName(value);
        if (localError) return localError;
        const canonical = await probeProcess(
          "git",
          ["check-ref-format", "--branch", value.trim()],
          repository.rootUri.fsPath,
          5_000,
        );
        if (!canonical.ok) return "Git rejected this branch name.";
        try {
          const existing = await repository.getBranch(value.trim());
          if (existing) return "A branch with this name already exists.";
        } catch {
          /* getBranch rejects when the ref is absent. */
        }
        return undefined;
      },
    });
    if (!name) return;

    try {
      if (
        repository.state.workingTreeChanges.length ||
        repository.state.indexChanges.length
      ) {
        const proceed = await vscode.window.showWarningMessage(
          "This repository has uncommitted changes. They will remain in the working tree after switching branches.",
          { modal: true },
          "Create Branch",
        );
        if (proceed !== "Create Branch") return;
      }
      await repository.createBranch(name.trim(), true);
      await waitForBranch(repository, name.trim());
      this.view?.webview.postMessage({
        type: "repositoryState",
        branch: name.trim(),
        available: true,
      });
      void vscode.window.showInformationMessage(
        `Created and switched to ${name.trim()}`,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Could not create branch: ${detail}`);
    }
  }

  async runCommandCodeTurn(text, requestedModel, effort) {
    if (!this.view || !text?.trim() || this.activeProcess) return;
    this.turnPending = true;
    try {
      await this.runCommandCodeTurnCore(text, requestedModel, effort);
    } finally {
      this.turnPending = false;
      if (!this.activeProcess) void this.postBackendStatus();
    }
  }

  async runCommandCodeTurnCore(text, requestedModel, effort) {
    if (!vscode.workspace.isTrusted) {
      this.view.webview.postMessage({
        type: "turnError",
        message: "Trust this workspace before running Command Code.",
      });
      return;
    }

    const model =
      this.models.find((candidate) => candidate.id === requestedModel) ||
      this.models.find(
        (candidate) =>
          candidate.id === this.context.workspaceState.get("selectedModel"),
      ) ||
      this.models[0];
    const send = (payload) => this.view?.webview.postMessage(payload);
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) {
      send({
        type: "turnError",
        message: "Open a workspace folder before starting Command Code.",
      });
      return;
    }

    const invocation = this.resolveCliInvocation();
    if (invocation.detected === false) {
      send({
        type: "turnError",
        message: `Command Code CLI was not found at ${invocation.displayPath}. Update commandDock.cliPath in Settings.`,
      });
      return;
    }

    if (!this.context.workspaceState.get("commandDockProjectTrusted", false)) {
      const trust = await vscode.window.showWarningMessage(
        `Trust “${vscode.workspace.name || path.basename(workspace)}” in Command Code? The CLI will be allowed to inspect files in this workspace. Agent writes still require separate per-turn authorization.`,
        { modal: true },
        "Trust in Command Code",
      );
      if (trust !== "Trust in Command Code") {
        send({
          type: "turnError",
          message: "Command Code project trust was not granted.",
        });
        return;
      }
      await this.context.workspaceState.update(
        "commandDockProjectTrusted",
        true,
      );
    }

    // The status indicator makes a network request and may still be running
    // from view activation. It must not become a second availability gate in
    // front of the real turn. Honor fresh definitive results; otherwise let
    // the CLI request report its own structured auth or transport error.
    const cachedCliStatus = this.getCachedCliStatus(invocation);
    if (cachedCliStatus?.kind === "incompatible") {
      send({
        type: "turnError",
        message: `Command Code ${cachedCliStatus.version} is incompatible. Update to ${MINIMUM_CLI_VERSION} or newer.`,
        action: "upgrade",
      });
      return;
    }
    if (cachedCliStatus?.kind === "signed-out") {
      send({
        type: "turnError",
        message: "Sign in to Command Code before sending a request.",
        action: "signIn",
      });
      return;
    }

    const config = vscode.workspace.getConfiguration("commandDock");
    const maxTurns = Math.max(1, Math.min(500, config.get("maxTurns", 100)));
    const permissionMode = this.permissionMode;
    const runGeneration = ++this.generation;
    if (
      permissionMode === "agent" &&
      this.agentAuthorizedGeneration !== runGeneration
    ) {
      const confirmation = await vscode.window.showWarningMessage(
        `Authorize this Agent turn for “${text.trim().slice(0, 120)}${text.trim().length > 120 ? "…" : ""}” with ${this.contextFiles.length + this.contextDirectories.length + this.contextSnippets.length} attached context item(s)? It can edit files and run shell commands with your VS Code permissions, including network or files outside this workspace.`,
        { modal: true },
        "Authorize This Turn",
      );
      if (
        confirmation !== "Authorize This Turn" ||
        runGeneration !== this.generation
      ) {
        this.permissionMode = "analyze";
        send({ type: "permissionModeSelected", mode: "analyze" });
        send({
          type: "turnError",
          message:
            "Agent authorization was not granted. Switched back to Analyze mode.",
        });
        return;
      }
      this.agentAuthorizedGeneration = runGeneration;
    }
    const missingContext = [];
    const unsafeContext = [];
    for (const uri of [...this.contextFiles, ...this.contextDirectories]) {
      if (!isSafeWorkspaceUri(uri)) {
        unsafeContext.push(displayContextPath(uri));
        continue;
      }
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        missingContext.push(displayContextPath(uri));
      }
    }
    if (unsafeContext.length) {
      send({
        type: "turnError",
        message: `Remove context that resolves outside the workspace or through an unsafe link: ${unsafeContext.join(", ")}`,
      });
      return;
    }
    if (missingContext.length) {
      send({
        type: "turnError",
        message: `Remove missing or renamed context before sending: ${missingContext.join(", ")}`,
      });
      return;
    }
    const attachedContext = this.contextFiles.map(displayContextPath);
    const imageContext = attachedContext.filter((file) =>
      /\.(?:png|jpe?g|webp|gif)$/i.test(file),
    );
    if (imageContext.length && !model.capabilities?.includes("vision")) {
      send({
        type: "turnError",
        message: `${model.label} is not marked as vision-capable. Remove image attachments or choose a vision model.`,
      });
      return;
    }
    const snippetText = this.contextSnippets
      .map((item) => `### ${item.label}\n${item.text}`)
      .join("\n\n")
      .slice(0, 200_000);
    const promptWithContext = snippetText
      ? `${text.trim()}\n\nStructured context explicitly attached in VS Code:\n${snippetText}`
      : text;
    const args = [
      ...buildRunArguments({
        prompt: promptWithContext,
        model: model.id,
        sessionId: this.sessionId,
        permissionMode,
        maxTurns,
        contextFiles: attachedContext,
        effort,
      }),
    ];
    const additionalDirectories = new Map();
    for (const folder of (vscode.workspace.workspaceFolders || []).slice(1))
      additionalDirectories.set(folder.uri.fsPath.toLowerCase(), folder.uri);
    for (const uri of this.contextDirectories)
      additionalDirectories.set(uri.fsPath.toLowerCase(), uri);
    for (const uri of additionalDirectories.values())
      args.push("--add-dir", uri.fsPath);
    args.push("--trust");

    send({ type: "turnStarted" });
    send({
      type: "activity",
      id: "run",
      label: "Starting Command Code",
      detail: permissionMode === "agent" ? "Agent mode" : "Analyze mode",
      status: "running",
    });
    send({
      type: "activity",
      id: "model",
      label: "Selected model",
      detail: model.label,
      status: "done",
    });
    send({
      type: "activity",
      id: "permission",
      label: "Permission boundary",
      detail:
        permissionMode === "agent"
          ? "Per-turn auto-accept authorized · --permission-mode auto-accept · --trust after explicit project trust"
          : "Read-only plan mode · --permission-mode plan · --trust after explicit project trust",
      status: "done",
    });
    this.wasCancelled = false;
    this.toolStarts.clear();
    this.log(
      "info",
      `Starting generation ${runGeneration} in ${permissionMode} mode with ${model.id}.`,
    );

    let finalReceived = false;

    const handleFrame = (frame) => {
      if (runGeneration !== this.generation) return;
      if (frame.type === "event") this.handleAgentEvent(frame.event, send);
      if (frame.type === "result") {
        finalReceived = true;
        if (isSafeSessionId(frame.sessionId))
          this.setSessionId(frame.sessionId);
        if (frame.subtype === "success" || frame.subtype === "max_turns") {
          send({
            type: "assistant",
            text:
              frame.finalText ||
              "Command Code completed without a text response.",
            summary: formatUsage(frame.usage, frame.durationMs),
          });
        } else {
          send({
            type: "turnError",
            message: frame.error || "Command Code returned an error.",
          });
        }
      }
    };

    this.activeProcess = { generation: runGeneration };
    this.setRunActive(true);
    const result = await this.client.run(
      {
        invocation,
        args,
        cwd: workspace,
        generation: runGeneration,
        env: createInvocationEnvironment(invocation),
        maxEvents: 10_000,
      },
      {
        onFrame: (frame, generation) => {
          if (generation === this.generation) handleFrame(frame);
        },
        onDiagnostic: (message) => this.log("info", message),
      },
    );
    this.activeProcess = undefined;
    this.setRunActive(false);
    if (result.generation !== this.generation && !result.cancelled) return;
    if (result.cancelled || this.wasCancelled) {
      send({
        type: "activity",
        id: "run",
        label: "Command Code stopped",
        detail: "",
        status: "done",
      });
      send({ type: "turnCancelled" });
    } else if (!finalReceived) {
      send({
        type: "turnError",
        message:
          result.error?.message ||
          "Command Code ended without a final response.",
        action: result.error?.action,
      });
    } else {
      send({
        type: "activity",
        id: "run",
        label: "Command Code finished",
        detail: "",
        status: "done",
      });
      send({ type: "turnFinished" });
    }
    if (permissionMode === "agent") {
      this.permissionMode = "analyze";
      this.agentAuthorizedGeneration = undefined;
      send({ type: "permissionModeSelected", mode: "analyze" });
    }
  }

  handleAgentEvent(event, send) {
    if (!event || typeof event.type !== "string") return;
    const id = event.toolCallId || event.id || event.type;
    if (event.type === "run_start") {
      send({
        type: "activity",
        id: "run",
        label: "Command Code connected",
        detail: "",
        status: "running",
      });
      return;
    }
    if (event.type === "model_request_start") {
      send({
        type: "activity",
        id: "model",
        label: "Running model",
        detail: event.model || "",
        status: "running",
      });
      return;
    }
    if (event.type === "model_request_end") {
      send({
        type: "activity",
        id: "model",
        label: "Model response received",
        detail: event.model || "",
        status: "done",
      });
      return;
    }
    if (event.type === "api_retry") {
      send({
        type: "activity",
        id: "api-retry",
        label: "Retrying model request",
        detail: `Attempt ${event.attempt || ""}`.trim(),
        status: "running",
      });
      return;
    }
    if (event.type === "tool_queued") {
      send({
        type: "activity",
        id,
        label: humanizeToolName(event.toolName),
        detail: event.description || "Queued",
        target: toolTarget(event),
        status: "running",
      });
      return;
    }
    if (event.type === "tool_running") {
      this.toolStarts.set(id, Date.now());
      send({
        type: "activity",
        id,
        label: humanizeToolName(event.toolName),
        detail: formatToolDetail(event),
        target: toolTarget(event),
        status: "running",
      });
      return;
    }
    if (event.type === "tool_update") {
      send({
        type: "activity",
        id,
        label: humanizeToolName(event.toolName),
        detail: event.description || event.message || "",
        target: toolTarget(event),
        status: "running",
      });
      return;
    }
    if (
      [
        "tool_completed",
        "tool_complete",
        "tool_finished",
        "tool_result",
      ].includes(event.type)
    ) {
      const elapsed = this.toolStarts.has(id)
        ? `${((Date.now() - this.toolStarts.get(id)) / 1000).toFixed(1)}s`
        : "";
      send({
        type: "activity",
        id,
        label: humanizeToolName(event.toolName),
        detail: [formatToolDetail(event) || "Done", elapsed]
          .filter(Boolean)
          .join(" · "),
        target: toolTarget(event),
        status: "done",
      });
      return;
    }
    if (
      [
        "tool_error",
        "tool_errored",
        "tool_failed",
        "tool_denied",
        "tool_hook_blocked",
        "tool_hook_error",
        "permission_denied",
        "permission_prompt",
      ].includes(event.type)
    ) {
      send({
        type: "activity",
        id,
        label: humanizeToolName(event.toolName || event.type),
        detail: event.error || event.message || "Failed",
        target: toolTarget(event),
        status: "error",
      });
      return;
    }
    if (
      ["text_delta", "assistant_delta", "content_delta"].includes(event.type) &&
      typeof (event.text || event.delta) === "string"
    ) {
      send({ type: "assistantDelta", text: event.text || event.delta });
      return;
    }
    this.log(
      "debug",
      `Ignored forward-compatible Command Code event: ${event.type}`,
    );
  }

  getHtml(webview) {
    const nonce = getNonce();
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "styles.css"),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "main.js"),
    );
    const logoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "commanddock.svg"),
    );
    const selectedModel =
      this.models.find(
        (candidate) =>
          candidate.id === this.context.workspaceState.get("selectedModel"),
      ) || this.models[0];
    const permissionMode = this.permissionMode;
    const modelOptions = this.models
      .map(
        (model) =>
          `<button class="model-option${model.id === selectedModel.id ? " selected" : ""}" role="option" aria-selected="${model.id === selectedModel.id}" data-model="${escapeHtml(model.id)}" data-search="${escapeHtml(`${model.label} ${model.id} ${model.description}`.toLowerCase())}"><span><strong>${escapeHtml(model.label)}</strong><small>${escapeHtml(model.description)}</small></span>${icons.check}</button>`,
      )
      .join("");
    const workspaceName = escapeHtml(vscode.workspace.name || "Workspace");

    return `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
          <link rel="stylesheet" href="${styleUri}" />
          <title>CommandDock</title>
        </head>
        <body>
          <div class="shell">
            <header class="topbar">
              <div class="brand"><img src="${logoUri}" alt="" /><span>CommandDock</span><button class="backend-pill" id="backend-pill" title="Command Code CLI status" aria-label="Command Code CLI status"></button></div>
              <div class="top-actions">
                <button class="icon-button" id="create-branch" title="Create Git branch" aria-label="Create Git branch">${icons.branch}</button>
                <button class="icon-button" id="new-chat" title="New chat" aria-label="New chat">${icons.plus}</button>
                <button class="icon-button" id="more" title="Settings" aria-label="Settings">${icons.more}</button>
              </div>
            </header>

            <main id="conversation" class="conversation" aria-live="polite">
              <section id="welcome" class="welcome">
                <div class="mark"><img src="${logoUri}" alt="" /></div>
                <div class="eyebrow">YOUR CODING AGENT</div>
                <h1>What should we build?</h1>
                <p>Command works in your codebase and learns the patterns you keep.</p>
                <div class="suggestions">
                  <button class="suggestion" data-prompt="Explain how this codebase is organized">
                    <span class="suggestion-icon">${icons.layers}</span>
                    <span><strong>Explore the codebase</strong><small>Understand architecture and key files</small></span>
                    ${icons.arrow}
                  </button>
                  <button class="suggestion" data-prompt="Find a useful improvement and implement it">
                    <span class="suggestion-icon">${icons.spark}</span>
                    <span><strong>Improve something</strong><small>Find and ship a focused enhancement</small></span>
                    ${icons.arrow}
                  </button>
                  <button class="suggestion" data-prompt="Review my current changes for bugs">
                    <span class="suggestion-icon">${icons.review}</span>
                    <span><strong>Review my changes</strong><small>Look for bugs, risks, and regressions</small></span>
                    ${icons.arrow}
                  </button>
                </div>
              </section>
              <section id="messages" class="messages" hidden></section>
            </main>

            <footer class="composer-wrap">
              <div class="model-popover" id="model-popover" role="listbox" aria-label="Choose model" hidden>
                <div class="popover-title"><span>MODELS</span><span id="model-count">${this.models.length - 1} AVAILABLE</span></div>
                <label class="model-search">${icons.search}<input id="model-search" type="search" placeholder="Search models…" autocomplete="off" /></label>
                <div class="model-options">${modelOptions}</div>
                <div class="model-empty" id="model-empty" hidden>No matching models</div>
              </div>
              <div id="context-row" class="context-row">
                <button class="context-chip" id="workspace-chip">${icons.folder}<span>${workspaceName}</span><span class="scope">workspace</span></button>
                <div class="file-chips" id="file-chips"></div>
              </div>
              <div class="composer" id="composer">
                <div class="slash-popover" id="slash-popover" hidden><button data-slash="/plan "><strong>/plan</strong><span>Plan in read-only mode</span></button><button data-slash="/review"><strong>/review</strong><span>Review current changes</span></button><button data-slash="/model"><strong>/model</strong><span>Choose a model</span></button><button data-slash="/sessions"><strong>/sessions</strong><span>Manage CLI sessions</span></button><button data-slash="/fork"><strong>/fork</strong><span>Fork linked session</span></button><button data-slash="/rename"><strong>/rename</strong><span>Rename linked session</span></button><button data-slash="/rewind"><strong>/rewind</strong><span>Open checkpoint rewind</span></button><button data-slash="/worktree"><strong>/worktree</strong><span>Manage CLI worktrees</span></button><button data-slash="/skills"><strong>/skills</strong><span>Manage skills</span></button><button data-slash="/mcp"><strong>/mcp</strong><span>Manage MCP servers</span></button><button data-slash="/mods"><strong>/mods</strong><span>Manage mods</span></button><button data-slash="/memory"><strong>/memory</strong><span>Manage memory</span></button><button data-slash="/taste"><strong>/taste</strong><span>Manage taste</span></button><button data-slash="/status"><strong>/status</strong><span>Refresh backend status</span></button><button data-slash="/update"><strong>/update</strong><span>Update Command Code CLI</span></button></div>
                <textarea id="prompt" rows="1" aria-label="Message Command" placeholder="Ask Command to build, explain, or fix…"></textarea>
                <div class="composer-footer">
                  <div class="composer-options">
                    <button class="quiet-button" id="add-context" title="Add context">${icons.at}<span>Add context</span></button>
                    <button class="quiet-button" id="permission-mode" title="Choose permission mode">${icons.shield}<span id="permission-label">${permissionMode === "agent" ? "Agent" : "Analyze"}</span></button>
                    <label class="quiet-button effort-control" title="Reasoning effort"><span class="sr-only">Reasoning effort</span><select id="effort" aria-label="Reasoning effort"><option value="">Auto effort</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
                    <button class="quiet-button model-button" id="model-button" title="Choose model" aria-haspopup="listbox" aria-expanded="false"><span class="model-dot"></span><span id="model-label">${selectedModel.label}</span>${icons.chevron}</button>
                  </div>
                  <button class="send-button" id="send" aria-label="Send message" disabled>${icons.arrowUp}</button>
                </div>
              </div>
              <div class="meta-row"><button class="branch-status" id="branch-status" title="Create Git branch">${icons.branch}<span id="branch-label">Loading branch…</span></button><span>Shift+Enter for new line</span></div>
            </footer>
          </div>
          <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
      </html>`;
  }
}

function getNonce() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length)),
  ).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCliError(error) {
  const detail = error instanceof Error ? error.message : String(error);
  return `Could not start CommandDock: ${detail}`;
}

function probeCli(invocation, args, timeoutMs, trackProcess) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child;
    let timer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (child) trackProcess?.(child, false);
      resolve(result);
    };
    try {
      child = spawn(invocation.command, [...invocation.prefixArgs, ...args], {
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: createInvocationEnvironment(invocation),
      });
      trackProcess?.(child, true);
    } catch (error) {
      resolve({ ok: false, stdout, stderr, error: formatCliError(error) });
      return;
    }
    timer = setTimeout(() => {
      child.kill();
      finish({
        ok: false,
        stdout,
        stderr,
        error: `Command Code ${describeCliProbe(args)} timed out.`,
      });
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-50_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-12_000);
    });
    child.on("error", (error) =>
      finish({ ok: false, stdout, stderr, error: formatCliError(error) }),
    );
    child.on("close", (code) =>
      finish({
        ok: code === 0,
        stdout,
        stderr,
        error:
          code === 0
            ? ""
            : cleanCliMessage(stderr) ||
              `Command Code exited with code ${code}.`,
      }),
    );
  });
}

function describeCliProbe(args) {
  if (args.includes("status")) return "status check";
  if (args.includes("--list-models")) return "model catalog check";
  if (args.includes("--version")) return "version check";
  return "check";
}

function probeProcess(command, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    let stderr = "";
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, stderr: "Timed out." });
    }, timeoutMs);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-2_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, stderr: String(error) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stderr });
    });
  });
}

function createInvocationEnvironment(invocation) {
  return createCliEnvironment(process.env, {
    electronRunAsNode:
      invocation.command === process.execPath &&
      invocation.prefixArgs.some((value) => /\.(?:c?js|mjs)$/i.test(value)),
  });
}

function waitForBranch(repository, expected) {
  if (repository.state.HEAD?.name === expected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error("Git did not confirm the branch checkout."));
    }, 5_000);
    const subscription = repository.state.onDidChange(() => {
      if (repository.state.HEAD?.name !== expected) return;
      clearTimeout(timer);
      subscription.dispose();
      resolve();
    });
  });
}

function isLikelyBinary(filePath) {
  return /\.(?:ico|pdf|zip|gz|7z|rar|exe|dll|so|dylib|woff2?|ttf|mp[34]|mov|avi|parquet|sqlite|db)$/i.test(
    filePath,
  );
}

function containsSensitiveText(value) {
  if (typeof value !== "string") return false;
  return /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{16,}|\b(?:api[_-]?key|password|secret|token)\s*[:=]\s*["']?[^\s"']{8,})/i.test(
    value,
  );
}

function displayContextPath(uri) {
  return vscode.workspace.asRelativePath(
    uri,
    (vscode.workspace.workspaceFolders?.length || 0) > 1,
  );
}

function serializeContextUri(uri) {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return undefined;
  return {
    folder: folder.name,
    path: path.relative(folder.uri.fsPath, uri.fsPath).replaceAll("\\", "/"),
  };
}

function isSafeWorkspaceUri(uri) {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return false;
  try {
    const candidate = path.resolve(fs.realpathSync.native(uri.fsPath));
    const root = path.resolve(fs.realpathSync.native(folder.uri.fsPath));
    const caseSensitive = process.platform !== "win32";
    const comparableCandidate = caseSensitive
      ? candidate
      : candidate.toLowerCase();
    const comparableRoot = caseSensitive ? root : root.toLowerCase();
    return (
      comparableCandidate === comparableRoot ||
      comparableCandidate.startsWith(`${comparableRoot}${path.sep}`)
    );
  } catch {
    return false;
  }
}

function humanizeToolName(value = "Working") {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatToolDetail(event) {
  const target =
    event.path || event.filePath || event.command || event.target || "";
  return [event.description || event.message || "", target]
    .filter(Boolean)
    .map(String)
    .join(" — ")
    .slice(0, 2_000);
}

function toolTarget(event) {
  const value = event.path || event.filePath || event.target;
  return typeof value === "string" ? value.slice(0, 4_000) : "";
}

function formatUsage(usage, durationMs) {
  const seconds = Number.isFinite(durationMs)
    ? `${(durationMs / 1000).toFixed(1)}s`
    : "";
  const tokens =
    usage?.totalTokens ||
    usage?.total_tokens ||
    (usage?.inputTokens || 0) + (usage?.outputTokens || 0) ||
    (usage?.input_tokens || 0) + (usage?.output_tokens || 0);
  return [tokens ? `${tokens.toLocaleString()} tokens` : "", seconds]
    .filter(Boolean)
    .join(" · ");
}

const MODELS = [
  { id: "auto", label: "Auto", description: "Best model for the task" },
  {
    id: "Qwen/Qwen3.6-Max-Preview",
    label: "Qwen 3.6 Max Preview",
    description: "Vibe coding and efficient agents",
  },
  {
    id: "Qwen/Qwen3.6-Plus",
    label: "Qwen 3.6 Plus",
    description: "Agentic coding and reasoning",
  },
  {
    id: "Qwen/Qwen3.7-Flash",
    label: "Qwen 3.7 Flash",
    description: "Fast, low-cost agentic coding",
  },
  {
    id: "Qwen/Qwen3.7-Max",
    label: "Qwen 3.7 Max",
    description: "Long-horizon agent execution",
  },
  {
    id: "Qwen/Qwen3.7-Plus",
    label: "Qwen 3.7 Plus",
    description: "Reasoning at lower cost",
  },
  {
    id: "Qwen/Qwen3.8-Max",
    label: "Qwen 3.8 Max",
    description: "Autonomous professional work",
  },
  {
    id: "claude-fable-5",
    label: "Claude Fable 5",
    description: "Demanding long-horizon reasoning",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    description: "Fast and compact",
  },
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    description: "Strong agents and coding",
  },
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    description: "Previous flagship",
  },
  {
    id: "claude-opus-5",
    label: "Claude Opus 5",
    description: "Most intelligent Opus",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    description: "Fast and capable",
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    description: "Recommended speed and intelligence",
  },
  {
    id: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    description: "Fast hybrid-attention reasoning",
  },
  {
    id: "deepseek/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    description: "Long-context reasoning",
  },
  {
    id: "google/gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    description: "High-volume workhorse",
  },
  {
    id: "google/gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    description: "Parallel agentic execution",
  },
  {
    id: "google/gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash Lite",
    description: "Ideal for subagents",
  },
  {
    id: "google/gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    description: "Efficient agentic workflows",
  },
  {
    id: "meta/muse-spark-1.1",
    label: "Muse Spark 1.1",
    description: "Tool and computer use",
  },
  {
    id: "meta/muse-spark-1.2",
    label: "Muse Spark 1.2",
    description: "Large codebases and agents",
  },
  {
    id: "meta/muse-spark-1.2-contributor",
    label: "Muse Spark 1.2 Contributor",
    description: "Contributor-priced Muse",
  },
  {
    id: "MiniMaxAI/MiniMax-M2.5",
    label: "MiniMax M2.5",
    description: "Cross-platform full-stack work",
  },
  {
    id: "MiniMaxAI/MiniMax-M2.7",
    label: "MiniMax M2.7",
    description: "End-to-end engineering agent",
  },
  {
    id: "MiniMaxAI/MiniMax-M3",
    label: "MiniMax M3",
    description: "Frontier multimodal coding",
  },
  {
    id: "moonshotai/Kimi-K2.5",
    label: "Kimi K2.5",
    description: "Multimodal frontend coding",
  },
  {
    id: "moonshotai/Kimi-K2.6",
    label: "Kimi K2.6",
    description: "Long-horizon coding with vision",
  },
  {
    id: "moonshotai/Kimi-K2.7-Code",
    label: "Kimi K2.7 Code",
    description: "Improved long-horizon coding",
  },
  {
    id: "moonshotai/Kimi-K2.7-Code-Highspeed",
    label: "Kimi K2.7 Code HighSpeed",
    description: "High-speed coding with vision",
  },
  {
    id: "moonshotai/Kimi-K3",
    label: "Kimi K3",
    description: "One-million-token knowledge work",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    label: "Nemotron 3 Ultra",
    description: "Autonomous agent reasoning",
  },
  {
    id: "gpt-5.3-codex",
    label: "GPT-5.3 Codex",
    description: "Frontier coding model",
  },
  { id: "gpt-5.4", label: "GPT-5.4", description: "Complex general work" },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    description: "Fast everyday tasks",
  },
  { id: "gpt-5.5", label: "GPT-5.5", description: "Frontier complex work" },
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    description: "Cost-sensitive workloads",
  },
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    description: "Complex professional work",
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    description: "Balanced intelligence and cost",
  },
  {
    id: "poolside/laguna-s-2.1-free",
    label: "Laguna S 2.1",
    description: "Open-weight agentic coding",
  },
  {
    id: "sakana/fugu-ultra",
    label: "Fugu Ultra",
    description: "Multi-agent orchestration",
  },
  {
    id: "stepfun/Step-3.5-Flash",
    label: "Step 3.5 Flash",
    description: "Fast sparse-MoE reasoning",
  },
  {
    id: "stepfun/Step-3.7-Flash",
    label: "Step 3.7 Flash",
    description: "Multimodal sparse-MoE reasoning",
  },
  {
    id: "tencent/hy3-paid",
    label: "Tencent Hy3",
    description: "Agentic tool use",
  },
  {
    id: "thinkingmachines/inkling",
    label: "Inkling",
    description: "Multimodal reasoning",
  },
  {
    id: "thinkingmachines/inkling-small",
    label: "Inkling Small",
    description: "Lower-cost reasoning",
  },
  {
    id: "xai/grok-4.5",
    label: "Grok 4.5",
    description: "Coding and knowledge work",
  },
  {
    id: "xiaomi/mimo-v2.5",
    label: "MiMo V2.5",
    description: "Efficient long-context coding",
  },
  {
    id: "xiaomi/mimo-v2.5-pro",
    label: "MiMo V2.5 Pro",
    description: "High-capability agentic coding",
  },
  { id: "zai-org/GLM-5", label: "GLM-5", description: "Long-range planning" },
  {
    id: "zai-org/GLM-5.1",
    label: "GLM-5.1",
    description: "Autonomous coding agent",
  },
  {
    id: "zai-org/GLM-5.2",
    label: "GLM-5.2",
    description: "One-million-token coding",
  },
  {
    id: "zai-org/GLM-5.2-Fast",
    label: "GLM-5.2 Fast",
    description: "High-throughput long context",
  },
];

const icons = {
  plus: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>',
  branch:
    '<svg viewBox="0 0 16 16"><circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="5" r="1.5"/><path d="M4 4.5v7M5.5 10C9 10 12 8.5 12 6.5"/></svg>',
  shield:
    '<svg viewBox="0 0 16 16"><path d="M8 1.5 13 3v4.3c0 3-2 5.7-5 7.2-3-1.5-5-4.2-5-7.2V3l5-1.5Z"/></svg>',
  more: '<svg viewBox="0 0 16 16"><circle cx="3" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="13" cy="8" r="1"/></svg>',
  layers:
    '<svg viewBox="0 0 16 16"><path d="m8 2 6 3-6 3-6-3 6-3Z"/><path d="m2 8 6 3 6-3M2 11l6 3 6-3"/></svg>',
  spark:
    '<svg viewBox="0 0 16 16"><path d="M8 1.5 9.4 6 14 8l-4.6 2L8 14.5 6.6 10 2 8l4.6-2L8 1.5Z"/></svg>',
  review:
    '<svg viewBox="0 0 16 16"><path d="M3 2.5h10v11H3zM5.5 5h5M5.5 8h3M11 10.5l1 1 2-2"/></svg>',
  arrow:
    '<svg class="row-arrow" viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg>',
  folder: '<svg viewBox="0 0 16 16"><path d="M1.5 4h5l1-1.5h7v10h-13z"/></svg>',
  at: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><path d="M11.5 8v2a1.5 1.5 0 0 1-3 0V7a2 2 0 1 1-2-2"/></svg>',
  chevron:
    '<svg class="chevron" viewBox="0 0 16 16"><path d="m5 6 3 3 3-3"/></svg>',
  arrowUp: '<svg viewBox="0 0 16 16"><path d="M8 13V3M4 7l4-4 4 4"/></svg>',
  check:
    '<svg class="option-check" viewBox="0 0 16 16"><path d="m3 8 3 3 7-7"/></svg>',
  search:
    '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4"/><path d="m10 10 3 3"/></svg>',
};

function activate(context) {
  const provider = new CommandDockViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CommandDockViewProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
      },
    ),
    vscode.commands.registerCommand("commandDock.newChat", () =>
      provider.newChat(),
    ),
    vscode.commands.registerCommand("commandDock.focusChat", () =>
      vscode.commands.executeCommand("commandDock.chat.focus"),
    ),
    vscode.commands.registerCommand("commandDock.clearLocalData", () =>
      provider.clearLocalData(),
    ),
    vscode.commands.registerCommand("commandDock.copyDiagnostics", () =>
      vscode.env.clipboard.writeText(provider.diagnostics()),
    ),
    vscode.commands.registerCommand("commandDock.openDocs", () =>
      vscode.env.openExternal(vscode.Uri.parse("https://commandcode.ai/docs")),
    ),
    vscode.commands.registerCommand("commandDock.openPrivacy", () =>
      vscode.env.openExternal(
        vscode.Uri.parse("https://commandcode.ai/privacy"),
      ),
    ),
    vscode.commands.registerCommand("commandDock.openTerms", () =>
      vscode.env.openExternal(vscode.Uri.parse("https://commandcode.ai/terms")),
    ),
    vscode.commands.registerCommand("commandDock.refreshStatus", () =>
      provider.postBackendStatus({ force: true }),
    ),
    vscode.commands.registerCommand("commandDock.updateCli", () =>
      provider.updateCli(),
    ),
    vscode.commands.registerCommand("commandDock.signIn", () =>
      provider.signIn(),
    ),
    vscode.commands.registerCommand("commandDock.resumeLatest", () =>
      provider.resumeLatest(),
    ),
    vscode.commands.registerCommand("commandDock.forgetSession", () =>
      provider.setSessionId(undefined),
    ),
    vscode.commands.registerCommand("commandDock.openInCli", () =>
      provider.openCliSurface(
        provider.sessionId ? ["--resume", provider.sessionId] : [],
      ),
    ),
    vscode.commands.registerCommand("commandDock.manageSessions", () =>
      provider.openCliSurface(["--resume"]),
    ),
    vscode.commands.registerCommand("commandDock.manageSkills", () =>
      provider.openCliSurface(["skills"]),
    ),
    vscode.commands.registerCommand("commandDock.manageMcp", () =>
      provider.openCliSurface(["mcp"]),
    ),
    vscode.commands.registerCommand("commandDock.manageTaste", () =>
      provider.openCliSurface(["taste"]),
    ),
    vscode.commands.registerCommand("commandDock.manageMods", () =>
      provider.openCliSurface(["mods"]),
    ),
    vscode.commands.registerCommand("commandDock.openMemory", () =>
      provider.openInteractiveSession("/memory"),
    ),
    vscode.commands.registerCommand("commandDock.forkSession", () =>
      provider.forkSession(),
    ),
    vscode.commands.registerCommand("commandDock.renameSession", () =>
      provider.renameSession(),
    ),
    vscode.commands.registerCommand("commandDock.rewindSession", () =>
      provider.openInteractiveSession("/rewind"),
    ),
    vscode.commands.registerCommand("commandDock.manageWorktrees", () =>
      provider.openInteractiveSession("/worktree"),
    ),
    vscode.commands.registerCommand("commandDock.cancel", () =>
      provider.cancelTurn(),
    ),
  );
  context.subscriptions.push(provider);

  if (
    vscode.extensions.getExtension("commandcode.commandcode-vscode") &&
    !context.globalState.get("officialExtensionNoticeShown")
  ) {
    void vscode.window
      .showInformationMessage(
        "CommandDock is installed alongside the Command Code extension. They use distinct views and commands; this chat delegates agent work to the same CLI.",
        "Got it",
      )
      .then(() =>
        context.globalState.update("officialExtensionNoticeShown", true),
      );
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
