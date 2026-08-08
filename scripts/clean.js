const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const target = path.resolve(root, "dist");

if (!target.startsWith(`${root}${path.sep}`)) {
  throw new Error(`Refusing to clean path outside the project: ${target}`);
}

fs.rmSync(target, { recursive: true, force: true });
