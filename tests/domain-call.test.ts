import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCall, toolTitle } from "../extensions/compact/domain/call.ts";
import { deps } from "./support/deps.ts";

const call = (tool: string, args: unknown): { text: string; more: boolean } =>
  summarizeCall(tool, args, "/repo", deps);

test("toolTitle names every special tool", () => {
  assert.equal(toolTitle("mcp__github__search"), "github:search");
  assert.equal(toolTitle("mcp__github"), "github:mcp__github");
  assert.equal(toolTitle("ask_user_question"), "ask");
  assert.equal(toolTitle("tool_search"), "tools");
  assert.equal(toolTitle("create_goal"), "goal:create");
  assert.equal(toolTitle("get_goal"), "goal:get");
  assert.equal(toolTitle("update_goal"), "goal:update");
  assert.equal(toolTitle("TaskOutput"), "task:output");
  assert.equal(toolTitle("Task"), "task");
  assert.equal(toolTitle("read"), "read");
});

test("summarizeCall handles codemode and bash", () => {
  assert.deepEqual(call("codemode", { code: 'tools.read({ path: "a.ts" });' }), {
    text: "read a.ts",
    more: false,
  });
  assert.deepEqual(call("bash", { command: "echo one\necho two" }), {
    text: "echo one",
    more: true,
  });
  assert.deepEqual(call("bash", {}), { text: "", more: false });
});

test("summarizeCall shows read ranges", () => {
  assert.deepEqual(call("read", { path: "/repo/a.ts" }), { text: "a.ts", more: false });
  assert.deepEqual(call("read", { path: "/repo/a.ts", offset: 3, limit: 2 }), {
    text: "a.ts:3-4",
    more: false,
  });
  assert.deepEqual(call("read", { path: "/repo/a.ts", offset: 3 }), {
    text: "a.ts:3+",
    more: false,
  });
  assert.deepEqual(call("read", { path: "/repo/a.ts", limit: 2 }), {
    text: "a.ts:1-2",
    more: false,
  });
  assert.deepEqual(call("read", { path: "/repo/a.ts", offset: -1, limit: 0 }), {
    text: "a.ts",
    more: false,
  });
  assert.deepEqual(call("read", { path: "/repo/a.ts", offset: 2.9, limit: 2.9 }), {
    text: "a.ts:2-3",
    more: false,
  });
  assert.deepEqual(call("read", {}), { text: "", more: false });
});

test("summarizeCall shows write, ls, and edit", () => {
  assert.deepEqual(call("write", { path: "/repo/a.ts" }), { text: "a.ts", more: false });
  assert.deepEqual(call("ls", { path: "/repo/src" }), { text: "src", more: false });
  assert.deepEqual(call("edit", { path: "/repo/a.ts", edits: [{}] }), {
    text: "a.ts · 1 edit",
    more: false,
  });
  assert.deepEqual(call("edit", { path: "/repo/a.ts", edits: [{}, {}] }), {
    text: "a.ts · 2 edits",
    more: false,
  });
  assert.deepEqual(call("edit", { path: "/repo/a.ts" }), { text: "a.ts", more: false });
});

test("summarizeCall shows grep and find", () => {
  assert.deepEqual(call("grep", { pattern: "TODO", path: "/repo/src", glob: "*.ts" }), {
    text: "TODO · src · *.ts",
    more: false,
  });
  assert.deepEqual(call("grep", { pattern: "TODO" }), { text: "TODO", more: false });
  assert.deepEqual(call("grep", { path: "/repo/src" }), { text: "src", more: false });
  assert.deepEqual(call("grep", { glob: "*.ts" }), { text: "", more: false });
  assert.deepEqual(call("grep", {}), { text: "", more: false });
  assert.deepEqual(call("find", { pattern: "*.ts", path: "/repo/src", glob: "*.ts" }), {
    text: "*.ts · src",
    more: false,
  });
});

test("summarizeCall shows multi_grep", () => {
  assert.deepEqual(call("multi_grep", { patterns: ["a", "b", "c"], constraints: "src" }), {
    text: "a, b +1 · src",
    more: false,
  });
  assert.deepEqual(call("multi_grep", { patterns: ["a"], path: "/repo/src" }), {
    text: "a · src",
    more: false,
  });
  assert.deepEqual(call("multi_grep", { patterns: ["a"] }), { text: "a", more: false });
  assert.deepEqual(call("multi_grep", { patterns: [1, "a"] }), { text: "a", more: false });
  assert.deepEqual(call("multi_grep", { patterns: [] }), { text: "", more: false });
  assert.deepEqual(call("multi_grep", {}), { text: "", more: false });
});

test("summarizeCall shows search and advisor text", () => {
  assert.deepEqual(call("tool_search", { query: "hello" }), { text: "hello", more: false });
  assert.deepEqual(call("recall", { query: "hello" }), { text: "hello", more: false });
  assert.deepEqual(call("advisor", { question: "why" }), { text: "why", more: false });
  assert.deepEqual(call("tool_search", {}), { text: "", more: false });
});

test("summarizeCall shows questions", () => {
  assert.deepEqual(
    call("ask_user_question", { questions: [{ question: "one" }, { question: "two" }] }),
    { text: "one +1", more: false },
  );
  assert.deepEqual(call("ask_user_question", { questions: [{ question: "one" }] }), {
    text: "one",
    more: false,
  });
  assert.deepEqual(call("ask_user_question", { questions: [] }), { text: "", more: false });
  assert.deepEqual(call("ask_user_question", {}), { text: "", more: false });
  assert.deepEqual(call("ask_user_question", { questions: [{}] }), { text: "", more: false });
});

test("summarizeCall shows goals", () => {
  assert.deepEqual(call("get_goal", { section: "progress" }), {
    text: "progress",
    more: false,
  });
  assert.deepEqual(call("get_goal", { task_id: "t1" }), { text: "t1", more: false });
  assert.deepEqual(call("get_goal", {}), { text: "", more: false });
  assert.deepEqual(call("create_goal", { objective: "ship it" }), {
    text: "ship it",
    more: false,
  });
  assert.deepEqual(call("update_goal", { task_id: "t1" }), { text: "t1", more: false });
  assert.deepEqual(call("update_goal", { section: "s1" }), { text: "s1", more: false });
  assert.deepEqual(call("update_goal", {}), { text: "", more: false });
});

test("summarizeCall shows Task and subagent calls", () => {
  assert.deepEqual(call("Task", { subagent_type: "explore", prompt: "do thing" }), {
    text: "explore",
    more: true,
  });
  assert.deepEqual(call("Task", { chain: ["a", "b"] }), { text: "a → b", more: false });
  assert.deepEqual(call("Task", { prompt: "do thing" }), { text: "do thing", more: false });
  assert.deepEqual(call("Task", {}), { text: "", more: false });
  assert.deepEqual(call("subagent", { agent: "explore" }), { text: "explore", more: false });
  assert.deepEqual(call("subagent", { task: "do thing" }), { text: "do thing", more: false });
  assert.deepEqual(call("subagent", {}), { text: "", more: false });
  assert.deepEqual(call("TaskOutput", { task_id: "t1" }), { text: "t1", more: false });
  assert.deepEqual(call("TaskOutput", {}), { text: "", more: false });
});

test("summarizeCall falls back to generic fields", () => {
  for (const key of [
    "description",
    "query",
    "question",
    "prompt",
    "path",
    "command",
    "pattern",
    "url",
    "name",
  ]) {
    assert.deepEqual(call("custom", { [key]: "value" }), { text: "value", more: false });
  }
  assert.deepEqual(call("custom", { description: "", query: "fallback" }), {
    text: "fallback",
    more: false,
  });
  assert.deepEqual(call("custom", { patterns: ["a", 2, "b"] }), {
    text: "a, b",
    more: false,
  });
  assert.deepEqual(call("custom", { foo: "bar", n: 2, flag: true, nested: {} }), {
    text: "foo=bar n=2",
    more: false,
  });
  assert.deepEqual(call("custom", {}), { text: "", more: false });
  assert.deepEqual(call("custom", undefined), { text: "", more: false });
});
