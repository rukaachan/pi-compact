import assert from "node:assert/strict";
import test from "node:test";
import { summarizeResult } from "../extensions/compact/domain/result.ts";
import { deps } from "./support/deps.ts";

const summarize = (tool: string, value: unknown, args: unknown = {}, isError = false) =>
  summarizeResult(tool, value, args, isError, deps);

const textResult = (text: string, details?: unknown, structuredContent?: unknown) => ({
  content: [{ type: "text", text }],
  details,
  structuredContent,
});

test("summarizeResult reports a non-bash error directly", () => {
  assert.deepEqual(summarize("read", textResult("boom"), {}, true), {
    status: "error",
    label: "failed",
    notes: [],
    detail: "boom",
  });
  assert.deepEqual(summarize("read", null, {}, true), {
    status: "error",
    label: "failed",
    notes: [],
    detail: "",
  });
});

test("summarizeResult counts codemode calls, failures, cancellations, and cost", () => {
  assert.deepEqual(summarize("codemode", { content: [], details: {} }), {
    status: "ok",
    label: "done",
    notes: [],
    detail: undefined,
  });
  assert.deepEqual(
    summarize("codemode", {
      content: [],
      details: {
        calls: [{ status: "ok", cost: 0.01 }, { status: "error" }, { status: "cancelled" }],
      },
    }),
    {
      status: "ok",
      label: "3 calls",
      notes: ["1 failed", "1 cancelled", "$0.01"],
      detail: undefined,
    },
  );
  assert.deepEqual(
    summarize(
      "codemode",
      textResult("Script error:\nError: boom", { truncation: { truncated: true } }),
      {},
      true,
    ),
    {
      status: "error",
      label: "failed",
      notes: ["truncated"],
      detail: "Error: boom",
    },
  );
});

test("summarizeResult reads a bash structured exit code", () => {
  assert.deepEqual(
    summarize(
      "bash",
      textResult("grep: missing\n\nCommand exited with code 2", undefined, { exit_code: 2 }),
      {},
      true,
    ),
    {
      status: "error",
      label: "exit 2",
      notes: [],
      detail: "grep: missing",
    },
  );
  assert.deepEqual(
    summarize("bash", textResult("output", undefined, { exit_code: "bad" }), {}, true),
    {
      status: "error",
      label: "failed",
      notes: [],
      detail: "output",
    },
  );
  assert.deepEqual(summarize("bash", textResult("output")), {
    status: "ok",
    label: "done",
    notes: [],
    detail: undefined,
  });
});

test("summarizeResult counts read payload lines and notices", () => {
  assert.deepEqual(summarize("read", textResult("a\nb\n", { truncation: { truncated: true } })), {
    status: "ok",
    label: "2 lines",
    notes: ["truncated"],
  });
  assert.deepEqual(summarize("read", textResult("")), {
    status: "ok",
    label: "",
    notes: [],
  });
  assert.deepEqual(summarize("read", textResult("", { truncation: { truncated: true } })), {
    status: "ok",
    label: "0 lines",
    notes: ["truncated"],
  });
  assert.deepEqual(summarize("read", textResult("[Showing lines 1-2]\na")), {
    status: "ok",
    label: "1 line",
    notes: ["truncated"],
  });
  assert.deepEqual(
    summarize("read", textResult("\n[Showing lines 1-2]", { truncation: { truncated: true } })),
    {
      status: "ok",
      label: "0 lines",
      notes: ["truncated"],
    },
  );
  assert.deepEqual(summarize("read", textResult("a\n\n[Showing lines 1-2]")), {
    status: "ok",
    label: "1 line",
    notes: ["truncated"],
  });
  assert.deepEqual(summarize("read", textResult("a\n[3 more lines]")), {
    status: "ok",
    label: "1 line",
    notes: ["truncated"],
  });
  assert.deepEqual(summarize("read", textResult("a\r\n[Output truncated]")), {
    status: "ok",
    label: "1 line",
    notes: ["truncated"],
  });
});

test("summarizeResult shows write size and edit count", () => {
  assert.deepEqual(summarize("write", { content: [] }, { content: "hello" }), {
    status: "ok",
    label: "written",
    notes: ["5 B"],
  });
  assert.deepEqual(summarize("write", { content: [] }, { content: "" }), {
    status: "ok",
    label: "written",
    notes: [],
  });
  assert.deepEqual(summarize("write", { content: [] }, { content: 1 }), {
    status: "ok",
    label: "written",
    notes: [],
  });
  assert.deepEqual(summarize("edit", { content: [] }, { edits: [{}, {}] }), {
    status: "ok",
    label: "2 edits",
    notes: [],
  });
  assert.deepEqual(summarize("edit", { content: [] }, { edits: [] }), {
    status: "ok",
    label: "edited",
    notes: [],
  });
  assert.deepEqual(summarize("edit", { content: [] }, {}), {
    status: "ok",
    label: "edited",
    notes: [],
  });
});

test("summarizeResult counts grep matches", () => {
  assert.deepEqual(summarize("grep", textResult("a:1: x\nb:2: y")), {
    status: "ok",
    label: "2 matches",
    notes: [],
  });
  assert.deepEqual(summarize("grep", textResult("no colon")), {
    status: "ok",
    label: "no matches",
    notes: [],
  });
  assert.deepEqual(summarize("grep", textResult("a:\nb:12x")), {
    status: "ok",
    label: "no matches",
    notes: [],
  });
  assert.deepEqual(summarize("multi_grep", textResult("a:1: x")), {
    status: "ok",
    label: "1 match",
    notes: [],
  });
});

test("summarizeResult counts find and ls entries", () => {
  assert.deepEqual(summarize("find", textResult("No files found matching pattern")), {
    status: "ok",
    label: "no files",
    notes: [],
  });
  assert.deepEqual(summarize("ls", textResult("(empty directory)")), {
    status: "ok",
    label: "empty",
    notes: [],
  });
  assert.deepEqual(summarize("find", textResult("a\nb")), {
    status: "ok",
    label: "2 files",
    notes: [],
  });
  assert.deepEqual(summarize("find", textResult("")), {
    status: "ok",
    label: "no files",
    notes: [],
  });
  assert.deepEqual(summarize("ls", textResult("a\nb")), {
    status: "ok",
    label: "2 entries",
    notes: [],
  });
  assert.deepEqual(summarize("ls", textResult("")), {
    status: "ok",
    label: "empty",
    notes: [],
  });
});

test("summarizeResult answers questions and handles generic tools", () => {
  assert.deepEqual(summarize("ask_user_question", textResult("")), {
    status: "ok",
    label: "answered",
    notes: [],
  });
  assert.deepEqual(summarize("ask_user_question", textResult(""), {}, true), {
    status: "error",
    label: "failed",
    notes: [],
    detail: "",
  });
  assert.deepEqual(summarize("custom", textResult("ok")), {
    status: "ok",
    label: "done",
    notes: [],
  });
  assert.deepEqual(summarize("custom", textResult("bad"), {}, true), {
    status: "error",
    label: "failed",
    notes: [],
    detail: "bad",
  });
});

test("summarizeResult detects truncation from details and text", () => {
  assert.deepEqual(summarize("read", textResult("a", { truncation: { truncated: true } })), {
    status: "ok",
    label: "1 line",
    notes: ["truncated"],
  });
  assert.deepEqual(summarize("read", textResult("a", { fullOutputPath: "/tmp/full" })), {
    status: "ok",
    label: "1 line",
    notes: ["truncated"],
  });
  assert.deepEqual(summarize("read", textResult("a", { truncation: { truncated: false } })), {
    status: "ok",
    label: "",
    notes: [],
  });
  assert.deepEqual(summarize("read", textResult("a\n[Showing lines 1-2]")), {
    status: "ok",
    label: "1 line",
    notes: ["truncated"],
  });
  assert.deepEqual(summarize("codemode", textResult("a\n[Showing lines 1-2]")), {
    status: "ok",
    label: "done",
    notes: [],
    detail: undefined,
  });
});

test("summarizeResult checks both ends of long text for notices", () => {
  const start = "[Showing lines 1-2]\n" + "x".repeat(5000);
  const end = "x".repeat(5000) + "\n[Output truncated]";
  const middle = "x".repeat(2000) + "[Showing lines 1-2]" + "x".repeat(2000);

  assert.deepEqual(summarize("read", textResult(start)), {
    status: "ok",
    label: "1 line",
    notes: ["truncated"],
  });
  assert.deepEqual(summarize("read", textResult(end)), {
    status: "ok",
    label: "1 line",
    notes: ["truncated"],
  });
  assert.deepEqual(summarize("read", textResult(middle)), {
    status: "ok",
    label: "",
    notes: [],
  });
});
