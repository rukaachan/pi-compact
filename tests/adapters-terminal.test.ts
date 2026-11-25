import assert from "node:assert/strict";
import test from "node:test";
import { createTerminal } from "../extensions/compact/adapters/terminal.ts";
import { createTextTools } from "../extensions/compact/domain/text.ts";

const terminal = createTerminal();
const text = createTextTools(terminal);

test("sanitize strips ANSI and OSC sequences", () => {
  assert.equal(terminal.sanitize("\u001b[31mred\u001b[0m"), "red");
  assert.equal(
    terminal.sanitize("\u001b]8;;https://example.com\u0007link\u001b]8;;\u0007"),
    "link",
  );
});

test("sanitize strips C0 and C1 control characters", () => {
  assert.equal(terminal.sanitize("a\u0000b\u0007c\u007Fd\u0085e\u009Ff"), "abcdef");
});

test("sanitize strips bidi controls", () => {
  assert.equal(terminal.sanitize("\u202Eevil\u202C"), "evil");
  assert.equal(terminal.sanitize("\u2066left\u2069"), "left");
});

test("sanitize strips zero-width characters", () => {
  assert.equal(terminal.sanitize("a\u200Bb\u200Cc\u200Dd\u2060e\uFEFFf"), "abcdef");
  assert.equal(
    terminal.sanitize(
      "\u061C\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2060\u2066\u2067\u2068\u2069\uFEFF",
    ),
    "",
  );
});

test("sanitize keeps surrogate pairs intact", () => {
  const value = "a😀b";
  assert.equal(terminal.sanitize(value), value);
});

test("clipPreview never splits a surrogate pair", () => {
  const clipped = text.clipPreview("a" + "😀".repeat(300));
  const last = clipped.charCodeAt(clipped.length - 1);
  assert.ok(last >= 0xdc00 && last <= 0xdfff);
});
