import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCommand } from "../extensions/compact/domain/command.ts";
import { deps } from "./support/deps.ts";

test("summarizeCommand rejects non-strings and empty input", () => {
  assert.deepEqual(summarizeCommand(undefined, deps), { text: "", more: false });
  assert.deepEqual(summarizeCommand("\n\n", deps), { text: "", more: false });
});

test("summarizeCommand drops environment assignments", () => {
  assert.deepEqual(summarizeCommand("FOO=bar cargo build", deps), {
    text: "cargo build",
    more: false,
  });
  assert.deepEqual(summarizeCommand('FOO="two words" ls', deps), { text: "ls", more: false });
});

test("summarizeCommand drops a leading cd", () => {
  assert.deepEqual(summarizeCommand('cd "/repo" && ls', deps), { text: "ls", more: false });
  assert.deepEqual(summarizeCommand("cd '/repo' && ls", deps), { text: "ls", more: false });
  assert.deepEqual(summarizeCommand("cd /repo && ls", deps), { text: "ls", more: false });
});

test("summarizeCommand keeps a bare cd when nothing follows", () => {
  assert.deepEqual(summarizeCommand("cd /repo", deps), { text: "cd /repo", more: false });
  assert.deepEqual(summarizeCommand('cd "/repo"', deps), { text: 'cd "/repo"', more: false });
  assert.deepEqual(summarizeCommand("cd '/repo'", deps), { text: "cd '/repo'", more: false });
});

test("summarizeCommand unwraps a shell", () => {
  assert.deepEqual(summarizeCommand('bash -lc "echo hi"', deps), { text: "echo hi", more: false });
  assert.deepEqual(summarizeCommand("sh -c 'echo hi'", deps), { text: "echo hi", more: false });
  assert.deepEqual(summarizeCommand("zsh -c echo", deps), { text: "echo", more: false });
});

test("summarizeCommand collapses inline scripts", () => {
  assert.deepEqual(summarizeCommand('node -e "x"', deps), { text: "node -e …", more: false });
  assert.deepEqual(summarizeCommand("python3 -c 'print(1)'", deps), {
    text: "python3 -c …",
    more: false,
  });
});

test("summarizeCommand marks a heredoc as truncated", () => {
  assert.deepEqual(summarizeCommand("cat <<EOF\nx\nEOF", deps), { text: "cat", more: true });
});

test("summarizeCommand skips a prologue", () => {
  const command = "set -e\n#!/usr/bin/env bash\nexport FOO=bar\numask 022\nls";
  assert.deepEqual(summarizeCommand(command, deps), { text: "ls", more: false });
});

test("summarizeCommand carries a directory into an empty command", () => {
  assert.deepEqual(summarizeCommand("cd /repo\ncd /tmp &&", deps), {
    text: "cd /tmp",
    more: false,
  });
  assert.deepEqual(summarizeCommand('FOO=bar cd "" &&', deps), { text: "", more: false });
});

test("summarizeCommand marks multiple lines and handles CRLF", () => {
  assert.deepEqual(summarizeCommand("echo one\necho two", deps), {
    text: "echo one",
    more: true,
  });
  assert.deepEqual(summarizeCommand("echo one\r\necho two", deps), {
    text: "echo one",
    more: true,
  });
});
