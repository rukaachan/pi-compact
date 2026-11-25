import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPaths } from "../extensions/compact/adapters/paths.ts";

const paths = createPaths();
const home = homedir();

test("shortenPath keeps empty and relative paths unchanged", () => {
  assert.equal(paths.shorten(""), "");
  assert.equal(paths.shorten("."), ".");
  assert.equal(paths.shorten(".."), "..");
  assert.equal(paths.shorten("src/file.ts"), "src/file.ts");
  assert.equal(paths.shorten("  src/file.ts  "), "src/file.ts");
});

test("shortenPath shortens the home directory", () => {
  assert.equal(paths.shorten(home), "~");
  assert.equal(paths.shorten(join(home, "project")), "~/project");
  assert.equal(paths.shorten(join(home, "project") + "/"), "~/project");
  assert.equal(paths.shorten(home + "2"), home + "2");
});

test("shortenPath keeps tilde paths", () => {
  assert.equal(paths.shorten("~"), "~");
  assert.equal(paths.shorten("~/"), "~/");
  assert.equal(paths.shorten("~/project"), "~/project");
  assert.equal(paths.shorten("~/project/"), "~/project/");
});

test("shortenPath makes a cwd child relative", () => {
  assert.equal(paths.shorten("/repo/src/file.ts", "/repo"), "src/file.ts");
  assert.equal(paths.shorten("/repo/src/", "/repo"), "src");
  assert.equal(paths.shorten("/repo", "/repo"), "/repo");
});

test("shortenPath leaves paths outside cwd absolute", () => {
  assert.equal(paths.shorten("/tmp/file.ts", "/repo"), "/tmp/file.ts");
  assert.equal(paths.shorten("/repo2/file.ts", "/repo"), "/repo2/file.ts");
});

test("shortenPath keeps the root and drops trailing separators", () => {
  assert.equal(paths.shorten("/"), "/");
  assert.equal(paths.shorten("/tmp/"), "/tmp");
  assert.equal(paths.shorten("/tmp///"), "/tmp");
});

test("shortenPath rejects non-strings", () => {
  assert.equal(paths.shorten(undefined), "");
  assert.equal(paths.shorten(null), "");
  assert.equal(paths.shorten(42), "");
  assert.equal(paths.shorten({ path: "/repo" }), "");
});
