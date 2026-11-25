import assert from "node:assert/strict";
import test from "node:test";
import { createTerminal } from "../extensions/compact/adapters/terminal.ts";
import {
  byteSize,
  countEntries,
  createTextTools,
  plural,
} from "../extensions/compact/domain/text.ts";

const text = createTextTools(createTerminal());

test("clipPreview sanitizes and keeps short text", () => {
  assert.equal(text.clipPreview("\u001b[31mred\u001b[0m"), "red");
  assert.equal(text.clipPreview("plain"), "plain");
});

test("firstLine skips blank and invisible lines", () => {
  assert.equal(text.firstLine("\r\n  \r\nhello\r\nworld"), "hello");
  assert.equal(text.firstLine("\u001b[0m\n\u001b[0m"), "");
});

test("clipEnd handles non-strings, short text, and a split surrogate", () => {
  assert.equal(text.clipEnd(undefined, 10), "");
  assert.equal(text.clipEnd("short", 10), "short");
  assert.equal(text.clipEnd("ab" + "😀".repeat(10), 4), "ab…");
});

test("compressLine handles non-strings and both surrogate boundaries", () => {
  assert.equal(text.compressLine(undefined), "");
  assert.equal(text.compressLine("short"), "short");

  const head = "a".repeat(49) + "😀" + "b".repeat(30);
  assert.ok(text.compressLine(head, 72).startsWith("a".repeat(49) + "…"));

  const tail = "a".repeat(79) + "😀" + "b".repeat(19);
  assert.ok(text.compressLine(tail, 72).endsWith("😀" + "b".repeat(19)));
});

test("quoteValue quotes only whitespace", () => {
  assert.equal(text.quoteValue("plain"), "plain");
  assert.equal(text.quoteValue("two words"), '"two words"');
});

test("countEntries ignores blank and notice lines", () => {
  const value = "a\n  b  \n\n[Showing lines 1-2]\n[Output truncated]\n\t\nc";
  assert.equal(countEntries(value), 3);
  assert.equal(countEntries(""), 0);
  assert.equal(countEntries("one"), 1);
});

test("byteSize switches units", () => {
  assert.equal(byteSize(""), "0 B");
  assert.equal(byteSize("a"), "1 B");
  assert.equal(byteSize("a".repeat(1024)), "1.0 KB");
  assert.equal(byteSize("a".repeat(10240)), "10 KB");
  assert.equal(byteSize("a".repeat(1024 * 1024)), "1024 KB");
});

test("plural handles one, many, and a custom plural", () => {
  assert.equal(plural(1, "file"), "1 file");
  assert.equal(plural(2, "file"), "2 files");
  assert.equal(plural(2, "entry", "entries"), "2 entries");
  assert.equal(plural(0, "file"), "0 files");
});
