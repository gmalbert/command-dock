// @ts-check
const vscode = acquireVsCodeApi();
const prompt = document.getElementById("prompt");
const send = document.getElementById("send");
const welcome = document.getElementById("welcome");
const messages = document.getElementById("messages");
const conversation = document.getElementById("conversation");
const composer = document.getElementById("composer");
const modelButton = document.getElementById("model-button");
const modelPopover = document.getElementById("model-popover");
const modelLabel = document.getElementById("model-label");
const modelSearch = document.getElementById("model-search");
const modelEmpty = document.getElementById("model-empty");
const modelOptions = document.querySelector(".model-options");
const effort = document.getElementById("effort");
const slashPopover = document.getElementById("slash-popover");

const MAX_TRANSCRIPT_ENTRIES = 200;
const MAX_TEXT_LENGTH = 200_000;
const MAX_ACTIVITIES = 100;
let selectedModel =
  document.querySelector(".model-option.selected")?.dataset.model || "auto";
let busy = false;
let persistTimer;
let sequence = 0;
const savedUiState = vscode.getState() || {};
let transcript = restoreTranscript(savedUiState.transcript);
let favoriteModels = Array.isArray(savedUiState.favoriteModels)
  ? savedUiState.favoriteModels.slice(0, 50).map(String)
  : [];
let recentModels = Array.isArray(savedUiState.recentModels)
  ? savedUiState.recentModels.slice(0, 10).map(String)
  : [];
let currentCatalog = [];
let backendStatus = "checking";

function byId(id) {
  return document.getElementById(id);
}

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeText(value, limit = MAX_TEXT_LENGTH) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function restoreTranscript(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_TRANSCRIPT_ENTRIES).flatMap((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !["user", "assistant"].includes(entry.role)
    )
      return [];
    if (entry.role === "user") {
      return [
        {
          id: safeText(entry.id, 100),
          role: "user",
          text: safeText(entry.text),
          context: Array.isArray(entry.context)
            ? entry.context.slice(0, 100).map((file) => safeText(file, 1_000))
            : [],
          model: safeText(entry.model, 300),
          effort: safeText(entry.effort, 20),
          mode: entry.mode === "agent" ? "agent" : "analyze",
        },
      ];
    }
    const status = ["pending", "complete", "error", "cancelled"].includes(
      entry.status,
    )
      ? entry.status
      : "error";
    const activities = Array.isArray(entry.activities)
      ? entry.activities.slice(-MAX_ACTIVITIES).flatMap((activity) => {
          if (!activity || typeof activity !== "object") return [];
          return [
            {
              id: safeText(activity.id, 200),
              label: safeText(activity.label, 500),
              detail: safeText(activity.detail, 2_000),
              target: safeText(activity.target, 4_000),
              status: ["running", "done", "error"].includes(activity.status)
                ? activity.status
                : "running",
            },
          ];
        })
      : [];
    return [
      {
        id: safeText(entry.id, 100),
        role: "assistant",
        status: status === "pending" ? "cancelled" : status,
        text: safeText(entry.text),
        summary: safeText(entry.summary, 500),
        error:
          status === "pending"
            ? "Interrupted by reload — send a follow-up to continue the saved Command Code session."
            : safeText(entry.error, 12_000),
        activities,
      },
    ];
  });
}

function currentTurn() {
  return [...transcript]
    .reverse()
    .find((entry) => entry.role === "assistant" && entry.status === "pending");
}

function autosize() {
  prompt.style.height = "auto";
  prompt.style.height = `${Math.min(prompt.scrollHeight, 160)}px`;
  send.disabled = busy ? false : !prompt.value.trim();
  send.classList.toggle("stop", busy);
  send.setAttribute(
    "aria-label",
    busy ? "Stop CommandDock run" : "Send message",
  );
}

function showMessages() {
  welcome.hidden = true;
  messages.hidden = false;
}

function scrollToBottom(force = false) {
  const nearBottom =
    conversation.scrollHeight -
      conversation.scrollTop -
      conversation.clientHeight <
    100;
  if (force || nearBottom)
    requestAnimationFrame(() =>
      conversation.scrollTo({
        top: conversation.scrollHeight,
        behavior: "smooth",
      }),
    );
}

function persistUiState() {
  vscode.setState({
    version: 1,
    transcript: transcript.slice(-MAX_TRANSCRIPT_ENTRIES),
    favoriteModels,
    recentModels,
  });
}

function schedulePersist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persistUiState, 100);
}

function renderActivity(activity) {
  const row = createElement(
    activity.detail ? "details" : "div",
    `activity ${activity.status}`,
  );
  const content = activity.detail ? createElement("summary") : row;
  content.append(
    createElement("span", "activity-icon"),
    createElement("span", "activity-label", activity.label),
  );
  if (activity.detail) {
    row.append(
      content,
      createElement("div", "activity-detail", activity.detail),
    );
  }
  if (activity.target) {
    const openButton = createElement("button", "activity-open", "Open file");
    openButton.type = "button";
    openButton.dataset.path = activity.target;
    const diffButton = createElement(
      "button",
      "activity-open activity-diff",
      "Open changes",
    );
    diffButton.type = "button";
    diffButton.dataset.path = activity.target;
    row.append(openButton, diffButton);
  }
  return row;
}

function renderUserMessage(entry) {
  const article = createElement("article", "message user-message");
  article.dataset.entryId = entry.id;
  article.append(
    createElement("div", "message-label", "YOU"),
    createElement("div", "user-bubble", entry.text),
  );
  const metadata = [
    entry.mode === "agent" ? "Agent" : "Analyze",
    entry.model,
    entry.effort ? `${entry.effort} effort` : "",
    ...(entry.context || []),
  ].filter(Boolean);
  if (metadata.length)
    article.append(createElement("div", "turn-metadata", metadata.join(" · ")));
  return article;
}

function renderAssistantMessage(entry) {
  const article = createElement(
    "article",
    `message assistant-message${entry.status === "pending" ? " pending" : ""}`,
  );
  article.dataset.entryId = entry.id;
  const head = createElement("div", "assistant-head");
  head.append(
    createElement("span", "agent-mark", "C"),
    createElement("strong", "", "Command"),
  );
  if (entry.status === "pending" && !entry.text)
    head.append(createElement("span", "thinking", "Thinking"));
  article.append(head);

  if (entry.activities.length) {
    const list = createElement("div", "activity-list");
    list.append(...entry.activities.map(renderActivity));
    article.append(list);
  }
  if (entry.text) article.append(renderMarkdown(entry.text));

  if (entry.status === "error") {
    const error = createElement("div", "turn-error");
    error.append(
      createElement(
        "strong",
        "",
        "CommandDock couldn’t complete this request.",
      ),
      createElement("span", "", entry.error || "Unknown error"),
    );
    article.append(error);
    const actions = createElement("div", "error-actions");
    const retry = createElement("button", "retry-turn", "Retry");
    retry.type = "button";
    actions.append(retry);
    if (/sign in|auth/i.test(entry.error || "")) {
      const signIn = createElement("button", "sign-in", "Sign in");
      signIn.type = "button";
      actions.append(signIn);
    }
    article.append(actions);
  }
  if (entry.status === "cancelled") {
    article.append(
      createElement("div", "turn-cancelled", entry.error || "Stopped"),
    );
  }
  if (entry.status === "complete") {
    const actions = createElement("div", "turn-actions");
    const copy = createElement("button", "copy-response", "Copy");
    copy.type = "button";
    copy.title = "Copy response";
    const regenerate = createElement("button", "regenerate-turn", "Regenerate");
    regenerate.type = "button";
    const edit = createElement("button", "edit-turn", "Edit prompt");
    edit.type = "button";
    actions.append(
      copy,
      regenerate,
      edit,
      createElement("span", "summary", entry.summary),
    );
    article.append(actions);
  }
  return article;
}

function renderMarkdown(value) {
  const root = createElement("div", "assistant-copy");
  const lines = safeText(value).split("\n");
  let code;
  let list;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const fence = line.match(/^```([\w.+-]*)\s*$/);
    if (fence) {
      if (code) {
        finalizeCodeBlock(code);
        root.append(code.wrapper);
        code = undefined;
      } else {
        const wrapper = createElement("div", "code-block");
        const header = createElement("div", "code-header");
        const copy = createElement("button", "copy-code", "Copy");
        copy.type = "button";
        header.append(createElement("span", "", fence[1] || "code"), copy);
        const pre = createElement("pre");
        const node = createElement("code");
        pre.append(node);
        wrapper.append(header, pre);
        code = { wrapper, node, lines: [], language: fence[1] || "code" };
      }
      list = undefined;
      continue;
    }
    if (code) {
      code.lines.push(line);
      continue;
    }
    const headerCells = parseTableRow(line);
    const separators = parseTableRow(lines[lineIndex + 1] || "");
    if (
      headerCells.length > 0 &&
      separators.length === headerCells.length &&
      separators.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      const table = createElement("table", "markdown-table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      const alignments = separators.map((cell) =>
        cell.startsWith(":") && cell.endsWith(":")
          ? "center"
          : cell.endsWith(":")
            ? "right"
            : "left",
      );
      headerCells.forEach((cell, index) => {
        const header = document.createElement("th");
        header.scope = "col";
        header.style.textAlign = alignments[index];
        appendInline(header, cell);
        headRow.append(header);
      });
      head.append(headRow);
      table.append(head);
      const body = document.createElement("tbody");
      lineIndex += 2;
      while (lineIndex < lines.length) {
        const cells = parseTableRow(lines[lineIndex]);
        if (!cells.length) break;
        const row = document.createElement("tr");
        for (let index = 0; index < headerCells.length; index += 1) {
          const cell = document.createElement("td");
          cell.style.textAlign = alignments[index];
          appendInline(cell, cells[index] || "");
          row.append(cell);
        }
        body.append(row);
        lineIndex += 1;
      }
      table.append(body);
      root.append(table);
      lineIndex -= 1;
      list = undefined;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      root.append(createElement(`h${heading[1].length + 1}`, "", heading[2]));
      list = undefined;
      continue;
    }
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) {
      if (!list) {
        list = createElement("ul");
        root.append(list);
      }
      const li = createElement("li");
      appendInline(li, item[1]);
      list.append(li);
      continue;
    }
    list = undefined;
    if (!line.trim()) {
      root.append(createElement("div", "markdown-spacer"));
      continue;
    }
    const paragraph = createElement("p");
    appendInline(paragraph, line);
    root.append(paragraph);
  }
  if (code) {
    finalizeCodeBlock(code);
    root.append(code.wrapper);
  }
  return root;
}

function parseTableRow(value) {
  const clean = String(value || "").trim();
  if (!clean.includes("|")) return [];
  return clean
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replaceAll("\\|", "|").trim());
}

function finalizeCodeBlock(code) {
  const source = code.lines.join("\n");
  const language = String(code.language || "code").toLowerCase();
  code.node.className = `language-${language.replace(/[^a-z0-9_-]/g, "")}`;
  code.node.setAttribute("aria-label", `${language} code block`);
  code.node.tabIndex = 0;
  const supported =
    /^(?:js|jsx|ts|tsx|javascript|typescript|json|py|python|sh|bash|shell|css|html)$/;
  if (!supported.test(language)) {
    code.node.textContent = source;
    return;
  }
  const tokenPattern =
    /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b(?:async|await|break|case|catch|class|const|continue|def|do|else|export|extends|false|finally|for|from|function|if|import|in|interface|let|new|null|of|pass|return|throw|true|try|type|undefined|var|while|with|yield)\b)/g;
  let index = 0;
  for (const match of source.matchAll(tokenPattern)) {
    code.node.append(document.createTextNode(source.slice(index, match.index)));
    const token = match[0];
    const className =
      token.startsWith("//") || token.startsWith("#") || token.startsWith("/*")
        ? "token-comment"
        : /^["'`]/.test(token)
          ? "token-string"
          : /^\d/.test(token)
            ? "token-number"
            : "token-keyword";
    code.node.append(createElement("span", className, token));
    index = match.index + token.length;
  }
  code.node.append(document.createTextNode(source.slice(index)));
}

function appendInline(parent, value) {
  const pattern = /(`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let index = 0;
  for (const match of value.matchAll(pattern)) {
    parent.append(document.createTextNode(value.slice(index, match.index)));
    const token = match[0];
    if (token.startsWith("`"))
      parent.append(createElement("code", "inline-code", token.slice(1, -1)));
    else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      const anchor = createElement("a", "", link[1]);
      anchor.href = link[2];
      anchor.rel = "noreferrer noopener";
      parent.append(anchor);
    }
    index = match.index + token.length;
  }
  parent.append(document.createTextNode(value.slice(index)));
}

function renderTranscript({ scroll = true } = {}) {
  const wasNearBottom =
    conversation.scrollHeight -
      conversation.scrollTop -
      conversation.clientHeight <
    100;
  messages.replaceChildren(
    ...transcript.map((entry) =>
      entry.role === "user"
        ? renderUserMessage(entry)
        : renderAssistantMessage(entry),
    ),
  );
  if (transcript.length) showMessages();
  else {
    messages.hidden = true;
    welcome.hidden = false;
  }
  schedulePersist();
  if (scroll && wasNearBottom) scrollToBottom(true);
}

function submit(text = prompt.value) {
  let clean = text.trim();
  if (clean.startsWith("/")) {
    const [command, ...rest] = clean.split(/\s+/);
    if (command === "/model") {
      toggleModelPopover(true);
      return;
    }
    const surfaces = {
      "/sessions": "manageSessions",
      "/skills": "manageSkills",
      "/mcp": "manageMcp",
      "/taste": "manageTaste",
      "/mods": "manageMods",
      "/memory": "openMemory",
      "/fork": "forkSession",
      "/rename": "renameSession",
      "/rewind": "rewindSession",
      "/worktree": "manageWorktrees",
      "/status": "refreshStatus",
      "/update": "updateCli",
    };
    if (surfaces[command]) {
      vscode.postMessage({ type: surfaces[command] });
      prompt.value = "";
      autosize();
      slashPopover.hidden = true;
      return;
    }
    if (command === "/review")
      clean =
        "Review my current Git changes for correctness, security, and regressions.";
    else if (command === "/plan" && rest.length) {
      clean = `Create an implementation plan for: ${rest.join(" ")}`;
      byId("permission-label").textContent = "Analyze";
      vscode.postMessage({ type: "setAnalyze" });
    } else {
      addLocalError(
        `Unknown or incomplete command: ${command}. Try /plan, /review, /model, /sessions, /fork, /rename, /rewind, /worktree, /skills, /mcp, /mods, /memory, /taste, /status, or /update.`,
      );
      return;
    }
  }
  if (!clean || busy) return;
  const id = `${Date.now()}-${++sequence}`;
  const context = [...document.querySelectorAll(".file-chip")].map((chip) =>
    safeText(chip.dataset.file, 1_000),
  );
  const mode =
    byId("permission-label").textContent === "Agent" ? "agent" : "analyze";
  transcript.push(
    {
      id: `${id}-user`,
      role: "user",
      text: clean,
      context,
      model: selectedModel,
      effort: effort.value,
      mode,
    },
    {
      id: `${id}-assistant`,
      role: "assistant",
      status: "pending",
      text: "",
      summary: "",
      error: "",
      activities: [],
    },
  );
  transcript = transcript.slice(-MAX_TRANSCRIPT_ENTRIES);
  prompt.value = "";
  slashPopover.hidden = true;
  busy = true;
  composer.classList.add("busy");
  autosize();
  renderTranscript();
  vscode.postMessage({
    type: "prompt",
    text: clean,
    model: selectedModel,
    effort: effort.value || undefined,
  });
}

function addLocalError(message) {
  const id = `${Date.now()}-${++sequence}`;
  transcript.push({
    id,
    role: "assistant",
    status: "error",
    text: "",
    summary: "",
    error: safeText(message, 2_000),
    activities: [],
  });
  renderTranscript();
}

function toggleModelPopover(force) {
  const shouldOpen = typeof force === "boolean" ? force : modelPopover.hidden;
  modelPopover.hidden = !shouldOpen;
  modelButton.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen) {
    modelSearch.value = "";
    filterModels("");
    modelSearch.focus();
  }
}

function filterModels(query) {
  const normalized = query.trim().toLowerCase();
  let visibleCount = 0;
  document.querySelectorAll(".model-option").forEach((option) => {
    const visible = !normalized || option.dataset.search.includes(normalized);
    option.hidden = !visible;
    if (visible) visibleCount += 1;
  });
  modelEmpty.hidden = visibleCount > 0;
}

function selectModelOption(option) {
  if (!option) return;
  selectedModel = safeText(option.dataset.model, 300);
  recentModels = [
    selectedModel,
    ...recentModels.filter((id) => id !== selectedModel),
  ].slice(0, 10);
  document.querySelectorAll(".model-option").forEach((candidate) => {
    const isSelected = candidate === option;
    candidate.classList.toggle("selected", isSelected);
    candidate.setAttribute("aria-selected", String(isSelected));
    candidate.tabIndex = isSelected ? 0 : -1;
  });
  modelLabel.textContent =
    option.querySelector("strong")?.textContent || selectedModel;
  toggleModelPopover(false);
  modelButton.focus();
  schedulePersist();
  vscode.postMessage({ type: "selectModel", model: selectedModel });
}

function renderModelCatalog(models) {
  if (!Array.isArray(models) || !models.length) return;
  currentCatalog = models.slice(0, 500);
  const ordered = [...currentCatalog].sort((left, right) => {
    const leftRank = favoriteModels.includes(left.id)
      ? -2
      : recentModels.includes(left.id)
        ? -1
        : 0;
    const rightRank = favoriteModels.includes(right.id)
      ? -2
      : recentModels.includes(right.id)
        ? -1
        : 0;
    return (
      leftRank - rightRank ||
      String(left.provider).localeCompare(String(right.provider)) ||
      String(left.label).localeCompare(String(right.label))
    );
  });
  let lastProvider = "";
  const nodes = ordered.flatMap((model) => {
    if (!model || typeof model.id !== "string") return [];
    const result = [];
    if (model.provider && model.provider !== lastProvider) {
      lastProvider = model.provider;
      result.push(createElement("div", "model-provider", lastProvider));
    }
    const button = createElement(
      "button",
      `model-option${model.id === selectedModel ? " selected" : ""}`,
    );
    button.type = "button";
    button.dataset.model = safeText(model.id, 300);
    button.dataset.search = safeText(
      `${model.label} ${model.id} ${model.description} ${model.provider}`,
      2_000,
    ).toLowerCase();
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(model.id === selectedModel));
    button.tabIndex = model.id === selectedModel ? 0 : -1;
    const text = createElement("span");
    const title = createElement("strong", "", safeText(model.label, 100));
    const favorite = createElement(
      "span",
      "favorite-toggle",
      favoriteModels.includes(model.id) ? "★" : "☆",
    );
    favorite.setAttribute("role", "button");
    favorite.setAttribute(
      "aria-label",
      favoriteModels.includes(model.id)
        ? "Remove model from favorites"
        : "Add model to favorites",
    );
    favorite.tabIndex = 0;
    title.append(favorite);
    text.append(
      title,
      createElement("small", "", safeText(model.description, 500)),
    );
    if (Array.isArray(model.capabilities) && model.capabilities.length)
      text.append(
        createElement("small", "model-badges", model.capabilities.join(" · ")),
      );
    const check = createElement("span", "option-check", "✓");
    check.setAttribute("aria-hidden", "true");
    button.append(text, check);
    result.push(button);
    return result;
  });
  modelOptions.replaceChildren(...nodes);
  byId("model-count").textContent =
    `${Math.max(0, ordered.length - 1)} AVAILABLE`;
}

prompt.addEventListener("input", () => {
  autosize();
  slashPopover.hidden = !prompt.value.trimStart().startsWith("/");
});
prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
});
send.addEventListener("click", () =>
  busy ? vscode.postMessage({ type: "cancel" }) : submit(),
);
byId("new-chat").addEventListener("click", () => {
  if (
    (busy || prompt.value.trim()) &&
    !window.confirm(
      "Start a new chat and discard the current draft or running turn?",
    )
  )
    return;
  vscode.postMessage({ type: "newChat" });
});
byId("create-branch").addEventListener("click", () =>
  vscode.postMessage({ type: "createBranch" }),
);
byId("branch-status").addEventListener("click", () =>
  vscode.postMessage({ type: "createBranch" }),
);
byId("more").addEventListener("click", () =>
  vscode.postMessage({ type: "openSettings" }),
);
byId("backend-pill").addEventListener("click", () =>
  vscode.postMessage({
    type: backendStatus === "signed-out" ? "signIn" : "openSettings",
  }),
);
byId("add-context").addEventListener("click", () =>
  vscode.postMessage({ type: "pickContext" }),
);
byId("workspace-chip").addEventListener("click", () =>
  vscode.postMessage({ type: "previewContext" }),
);
byId("permission-mode").addEventListener("click", () =>
  vscode.postMessage({ type: "selectPermissionMode" }),
);
slashPopover.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-slash]");
  if (!button) return;
  prompt.value = button.dataset.slash;
  autosize();
  if (!prompt.value.endsWith(" ")) submit();
  else {
    slashPopover.hidden = true;
    prompt.focus();
  }
});

modelButton.addEventListener("click", () => toggleModelPopover());
modelSearch.addEventListener("input", () => filterModels(modelSearch.value));
modelSearch.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    toggleModelPopover(false);
    modelButton.focus();
  }
  if (event.key === "Enter") {
    const firstVisible = [...document.querySelectorAll(".model-option")].find(
      (option) => !option.hidden,
    );
    if (firstVisible) selectModelOption(firstVisible);
  }
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const visible = [...document.querySelectorAll(".model-option")].filter(
      (option) => !option.hidden,
    );
    const target =
      event.key === "End" || event.key === "ArrowUp"
        ? visible.at(-1)
        : visible[0];
    target?.focus();
  }
});
modelOptions.addEventListener("click", (event) => {
  const favorite = event.target.closest(".favorite-toggle");
  if (favorite) {
    event.preventDefault();
    event.stopPropagation();
    const id = favorite.closest(".model-option")?.dataset.model;
    if (id)
      favoriteModels = favoriteModels.includes(id)
        ? favoriteModels.filter((item) => item !== id)
        : [id, ...favoriteModels].slice(0, 50);
    renderModelCatalog(currentCatalog);
    schedulePersist();
    return;
  }
  selectModelOption(event.target.closest(".model-option"));
});
modelOptions.addEventListener("keydown", (event) => {
  const options = [...document.querySelectorAll(".model-option")].filter(
    (option) => !option.hidden,
  );
  const current = event.target.closest(".model-option");
  if (!current) return;
  const index = options.indexOf(current);
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    selectModelOption(current);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    toggleModelPopover(false);
    modelButton.focus();
    return;
  }
  let next;
  if (event.key === "ArrowDown")
    next = options[Math.min(options.length - 1, index + 1)];
  if (event.key === "ArrowUp") next = options[Math.max(0, index - 1)];
  if (event.key === "Home") next = options[0];
  if (event.key === "End") next = options.at(-1);
  if (next) {
    event.preventDefault();
    next.focus();
  }
});
document.addEventListener("click", (event) => {
  if (
    !modelPopover.hidden &&
    !modelPopover.contains(event.target) &&
    !modelButton.contains(event.target)
  )
    toggleModelPopover(false);
});
document
  .querySelectorAll(".suggestion")
  .forEach((button) =>
    button.addEventListener("click", () => submit(button.dataset.prompt)),
  );

messages.addEventListener("click", (event) => {
  const openDiff = event.target.closest(".activity-diff");
  if (openDiff) {
    vscode.postMessage({ type: "openDiff", path: openDiff.dataset.path });
    return;
  }
  const openFile = event.target.closest(".activity-open");
  if (openFile) {
    vscode.postMessage({ type: "openFile", path: openFile.dataset.path });
    return;
  }
  const signIn = event.target.closest(".sign-in");
  if (signIn) {
    vscode.postMessage({ type: "signIn" });
    return;
  }
  const retry = event.target.closest(".retry-turn");
  if (retry) {
    const assistantIndex = transcript.findIndex(
      (entry) =>
        entry.id === retry.closest(".assistant-message")?.dataset.entryId,
    );
    const previous =
      assistantIndex > 0 ? transcript[assistantIndex - 1] : undefined;
    if (previous?.role === "user") submit(previous.text);
    return;
  }
  const regenerate = event.target.closest(".regenerate-turn");
  const edit = event.target.closest(".edit-turn");
  if (regenerate || edit) {
    if (busy) return;
    const assistantIndex = transcript.findIndex(
      (entry) =>
        entry.id ===
        (regenerate || edit).closest(".assistant-message")?.dataset.entryId,
    );
    const previous =
      assistantIndex > 0 ? transcript[assistantIndex - 1] : undefined;
    if (previous?.role !== "user") return;
    if (regenerate) submit(previous.text);
    else {
      prompt.value = previous.text;
      prompt.focus();
      autosize();
    }
    return;
  }
  const link = event.target.closest('a[href^="https://"]');
  if (link) {
    event.preventDefault();
    vscode.postMessage({ type: "openExternal", url: link.href });
    return;
  }
  const codeButton = event.target.closest(".copy-code");
  if (codeButton) {
    vscode.postMessage({
      type: "copy",
      text:
        codeButton.closest(".code-block")?.querySelector("code")?.textContent ||
        "",
    });
    codeButton.textContent = "Copied";
    window.setTimeout(() => {
      codeButton.textContent = "Copy";
    }, 1200);
    return;
  }
  const button = event.target.closest(".copy-response");
  if (!button) return;
  const entryId = button.closest(".assistant-message")?.dataset.entryId;
  const entry = transcript.find(
    (candidate) => candidate.id === entryId && candidate.role === "assistant",
  );
  vscode.postMessage({ type: "copy", text: entry?.text || "" });
  button.textContent = "Copied";
  window.setTimeout(() => {
    button.textContent = "Copy";
  }, 1200);
});

window.addEventListener("message", ({ data }) => {
  if (!data || typeof data.type !== "string") return;
  if (data.type === "backendStatus") {
    const pill = byId("backend-pill");
    pill.className = `backend-pill ${safeText(data.status, 20)}`;
    pill.title = safeText(data.label, 200);
    backendStatus = safeText(data.status, 20);
  }
  if (data.type === "permissionModeSelected") {
    byId("permission-label").textContent =
      data.mode === "agent" ? "Agent" : "Analyze";
  }
  if (data.type === "contextUpdated") {
    const files = Array.isArray(data.files)
      ? data.files.map((file) => safeText(file, 1_000))
      : [];
    const chips = byId("file-chips");
    chips.replaceChildren(
      ...files.map((file) => {
        const chip = createElement("button", "context-chip file-chip");
        chip.type = "button";
        chip.dataset.file = file;
        chip.append(
          createElement("span", "", file.split(/[\\/]/).pop()),
          createElement("span", "remove-context", "×"),
        );
        chip.title = file;
        return chip;
      }),
    );
  }
  if (data.type === "modelCatalog") renderModelCatalog(data.models);
  if (data.type === "repositoryState") {
    byId("branch-label").textContent = data.available
      ? safeText(data.branch || "Detached HEAD", 200)
      : "No Git repository";
  }
  if (
    data.type === "modelSelected" &&
    data.model &&
    typeof data.model.id === "string"
  ) {
    selectedModel = data.model.id;
    modelLabel.textContent = safeText(data.model.label, 100);
  }
  if (data.type === "newChat") {
    transcript = [];
    busy = false;
    composer.classList.remove("busy");
    renderTranscript();
    prompt.focus();
    autosize();
  }
  if (data.type === "localDataCleared") {
    transcript = [];
    favoriteModels = [];
    recentModels = [];
    selectedModel = "auto";
    modelLabel.textContent = "Auto";
    vscode.setState({
      version: 1,
      transcript: [],
      favoriteModels: [],
      recentModels: [],
    });
    renderTranscript();
  }
  if (data.type === "activity") {
    const turn = currentTurn();
    if (turn) {
      const id = safeText(String(data.id || "activity"), 200);
      let activity = turn.activities.find((candidate) => candidate.id === id);
      if (!activity) {
        activity = {
          id,
          label: "",
          detail: "",
          target: "",
          status: "running",
        };
        turn.activities.push(activity);
        turn.activities = turn.activities.slice(-MAX_ACTIVITIES);
      }
      activity.label = safeText(data.label, 500);
      activity.detail = safeText(data.detail, 2_000);
      activity.target = safeText(data.target, 4_000);
      activity.status = ["running", "done", "error"].includes(data.status)
        ? data.status
        : "running";
      renderTranscript();
    }
  }
  if (data.type === "assistantDelta") {
    const turn = currentTurn();
    if (turn) {
      turn.text = safeText(`${turn.text}${safeText(data.text)}`);
      renderTranscript();
    }
  }
  if (data.type === "assistant") {
    const turn = currentTurn();
    if (turn) {
      turn.status = "complete";
      turn.text =
        safeText(data.text) ||
        "Command Code completed without a text response.";
      turn.summary = safeText(data.summary, 500);
      renderTranscript();
    }
  }
  if (data.type === "turnError") {
    const turn = currentTurn();
    if (turn) {
      turn.status = "error";
      turn.error = safeText(data.message, 12_000) || "Unknown error";
      renderTranscript();
    }
    busy = false;
    composer.classList.remove("busy");
    autosize();
  }
  if (data.type === "turnCancelled") {
    const turn = currentTurn();
    if (turn) {
      turn.status = "cancelled";
      turn.error = "Stopped";
      renderTranscript();
    }
    busy = false;
    composer.classList.remove("busy");
    autosize();
  }
  if (data.type === "turnFinished") {
    busy = false;
    composer.classList.remove("busy");
    autosize();
    prompt.focus();
  }
});

byId("file-chips").addEventListener("click", (event) => {
  const chip = event.target.closest(".file-chip");
  if (chip?.dataset.file)
    vscode.postMessage({ type: "removeContext", file: chip.dataset.file });
});

renderTranscript({ scroll: false });
autosize();
vscode.postMessage({ type: "ready" });
