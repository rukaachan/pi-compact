import assert from "node:assert/strict";
import test from "node:test";
import { extractCodeCalls, summarizeCode } from "../extensions/compact/domain/code.ts";
import { deps } from "./support/deps.ts";

const summarize = (code: unknown): string => summarizeCode(code, "/repo", deps).text;

test("summarizeCode rejects non-strings and falls back to code", () => {
  assert.equal(summarize(undefined), "");
  assert.deepEqual(summarizeCode("// @options: {}\n// only comments", "/repo", deps), {
    text: "",
    more: false,
  });
  assert.deepEqual(summarizeCode("const x = await load();\nconst y = 2;", "/repo", deps), {
    text: "load();",
    more: true,
  });
  assert.equal(summarize('const s = "// not a comment";'), '"// not a comment";');
  assert.equal(summarize("\u001b[0m"), "");
});

test("summarizeCode labels generic calls", () => {
  assert.equal(summarize('tools.custom({ query: "hello world" });'), "custom hello world");
  assert.equal(summarize('tools.custom({ path: "/repo/a.ts" });'), "custom a.ts");
  assert.equal(summarize('tools.custom({ glob: "*.ts" });'), "custom *.ts");
  assert.equal(summarize("tools.custom({});"), "custom");
  assert.equal(summarize('tools.custom({ command: "echo hi" });'), "custom echo hi");
});

test("summarizeCode labels bash, read, write, edit, and ls", () => {
  assert.equal(summarize('tools.bash({ command: "" });'), "bash");
  assert.equal(summarize("tools.bash({});"), "bash");
  assert.equal(summarize('tools.read({ path: "/repo/a.ts" });'), "read a.ts");
  assert.equal(summarize("tools.read();"), "read");
  assert.equal(summarize('tools.write({ path: "/repo/a.ts" });'), "write a.ts");
  assert.equal(summarize('tools.edit({ path: "/repo/a.ts" });'), "edit a.ts");
  assert.equal(summarize('tools.ls({ path: "/repo/src" });'), "ls src");
});

test("summarizeCode labels grep and find", () => {
  assert.equal(summarize('tools.grep({ pattern: "TODO" });'), "grep TODO");
  assert.equal(summarize('tools.find({ pattern: "*.ts", path: "/repo/src" });'), "find *.ts · src");
  assert.equal(summarize("tools.grep({});"), "grep");
});

test("summarizeCode counts a loop over literal files", () => {
  const code =
    'const files = ["a", "b"];\nfor (const f of files) { await tools.read({ path: f }); }';
  assert.equal(summarize(code), "read 2 files");
});

test("summarizeCode ignores loop variables that only prefix a name", () => {
  const code = 'const files = ["a"];\nfor (const f of files) { await tools.read({ path: foo }); }';
  assert.equal(summarize(code), "read {foo}");
});

test("summarizeCode handles parseFields edge cases", () => {
  assert.equal(
    summarize('tools.read({ path: "a", unknown: "x", empty: "", nested: { a: 1 } });'),
    "read a",
  );
  assert.equal(summarize('tools.read({ path: "a", "justkey", empty: "" });'), "read a");
  assert.equal(summarize("tools.read("), "read");
  assert.equal(summarize('tools.read({ path: "a"'), "read a");
});

test("summarizeCode ignores block comments and unclosed strings", () => {
  const block = '/* tools.bash({ command: "rm -rf /" }) */\nawait tools.read({ path: "a.ts" });';
  assert.equal(summarize(block), "read a.ts");

  const unclosed = 'const s = "tools.bash({ command: "rm" })\nawait tools.read({ path: "a.ts" });';
  assert.equal(summarize(unclosed), "read a.ts");
});

test("summarizeCode ignores calls in escaped strings and templates", () => {
  const single =
    'const s = \'it\\\'s tools.bash({ command: "x" })\';\nawait tools.read({ path: "a.ts" });';
  assert.equal(summarize(single), "read a.ts");

  const template =
    'const s = \x60a\\\x60 tools.bash({ command: "x" })\x60;\nawait tools.read({ path: "a.ts" });';
  assert.equal(summarize(template), "read a.ts");
});

test("summarizeCode reads calls inside template interpolation", () => {
  const code =
    'const name = "x";\nconst s = \x60hi ${name} ${tools.read({ path: "/repo/a.ts", query: { nested: { a: 1 } } })}\x60;\nawait tools.read({ path: "/repo/b.ts" });';
  assert.equal(summarize(code), "read a.ts + read b.ts");
});

test("summarizeCode handles quoted closers", () => {
  assert.equal(summarize('tools.read({ path: "a)b" });'), "read a)b");
  assert.equal(summarize('tools.read({ path: "a\\\"b" });'), 'read a"b');
  assert.equal(summarize("tools.bash({ command: \x60echo hi\x60 });"), "$ echo hi");
});

test("summarizeCode handles literal stars and grep loops", () => {
  assert.equal(summarize('tools.read({ path: "*" });'), "read *");
  const code = 'const files = ["a"];\nfor (const f of files) { await tools.grep({ pattern: f }); }';
  assert.equal(summarize(code), "grep * ×1");
});

test("summarizeCode caps at sixteen calls", () => {
  const code = Array.from(
    { length: 17 },
    (_, index) => 'tools.read({ path: "f' + index + '" });',
  ).join("\n");
  assert.equal(summarize(code), "16 calls: read, read, read +13");
});

test("extractCodeCalls returns fields and loop counts", () => {
  const code =
    'const files = ["a", "b"];\nfor (const f of files) { await tools.read({ path: f }); }';
  const calls = extractCodeCalls(code, deps);
  assert.deepEqual(calls, [{ tool: "read", fields: { path: "*" }, loopCount: 2 }]);
});
