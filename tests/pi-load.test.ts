import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(root, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js");

test("Pi loads the extension", () => {
  const result = spawnSync(process.execPath, [cli, "-e", "./extensions/index.ts", "--version"], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
});
