import type * as vscode from "vscode";

// Transitional entry point while the view provider is being decomposed. The
// production build now has a typed, stable entry path; host modules move under
// src/ without changing the packaged extension entry point again.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const legacy = require("../extension.js") as {
  activate(context: vscode.ExtensionContext): void;
  deactivate(): void;
};

export const activate = legacy.activate;
export const deactivate = legacy.deactivate;
