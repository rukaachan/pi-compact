import assert from "node:assert/strict";
import test from "node:test";
import type { Theme, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Box, stripTerminalSequences, Text, visibleWidth } from "@earendil-works/pi-tui";
import { callLine, statusLine } from "../extensions/compact/adapters/lines.ts";
import { createCompactRenderers } from "../extensions/compact/adapters/renderer.ts";
import { deps } from "./support/deps.ts";

type RenderResult = NonNullable<ToolRenderers["renderResult"]>;
type CallContext = Parameters<NonNullable<ToolRenderers["renderCall"]>>[2];
type ResultContext = Parameters<RenderResult>[3];
type RenderContext = CallContext & ResultContext;
type ResultValue = Parameters<RenderResult>[0];
type ResultOptions = Parameters<RenderResult>[1];

let nextId = 0;

const theme = {
  fg: (_token: string, text: string) => text,
  bg: (_token: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

const builtIn: ToolRenderers = {
  renderCall: () => new Text("expanded call", 0, 0),
  renderResult: () => new Text("expanded result", 0, 0),
};

function context(overrides: Record<string, unknown> = {}): RenderContext {
  return {
    args: {},
    toolCallId: "row-" + ++nextId,
    invalidate: () => {},
    lastComponent: undefined,
    state: {},
    cwd: "/repo",
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    expanded: false,
    showImages: true,
    isError: false,
    durationMs: 67,
    outputPad: 0,
    ...overrides,
  } as RenderContext;
}

type Drawable = { render(width: number): string[] } | undefined;

/** Every line the component paints, padding included. */
function raw(component: Drawable, width = 80): string[] {
  return (component?.render(width) ?? []).map((line) => line.trimEnd());
}

function trimEdges(rendered: string[]): string[] {
  let start = 0;
  let end = rendered.length;
  while (start < end && rendered[start] === "") start++;
  while (end > start && rendered[end - 1] === "") end--;
  return rendered.slice(start, end);
}

/** The text of a card, without the background padding above and below it. */
function lines(component: Drawable, width = 80): string[] {
  return trimEdges(raw(component, width));
}

function render(
  tool: string,
  args: Record<string, unknown>,
  result: Record<string, unknown> = { content: [], details: undefined },
  options: Record<string, unknown> = {},
) {
  const row = createRow(tool, args);
  const call = row.call(options);
  return { call, result: row.result(result, options) };
}

/** One live row: Pi renders the call slot, then the result slot, on the same frame. */
function createRow(tool: string, args: Record<string, unknown>) {
  const renderers = createCompactRenderers(tool, builtIn);
  const state: Record<string, unknown> = {};
  const id = "row-" + ++nextId;
  const ctx = (extra: Record<string, unknown> = {}) =>
    context({ args, state, toolCallId: id, ...extra });
  const renderCall = (extra: Record<string, unknown> = {}) =>
    renderers.renderCall!(args, theme, ctx(extra));
  const renderResult = (result: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    renderers.renderResult!(
      result as unknown as ResultValue,
      { expanded: false, isPartial: false } as ResultOptions,
      theme,
      ctx(extra),
    );

  return {
    state,
    id,
    call: renderCall,
    callLines: (extra: Record<string, unknown> = {}) => lines(renderCall(extra)),
    result: (result: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
      renderCall(extra);
      return renderResult(result, extra);
    },
    frame: (result: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
      trimEdges([...raw(renderCall(extra)), ...raw(renderResult(result, extra))]),
  };
}

test("codemode shows the nested command, not the JavaScript", () => {
  const { call, result } = render(
    "codemode",
    {
      code: 'const r = await tools.bash({ command: "cd /repo && TMPDIR=/tmp CARGO_TARGET_DIR=/tmp/t cargo build --release" });\nreturn r;',
    },
    { content: [{ type: "text", text: "ok" }], details: { calls: [{ status: "ok" }] } },
  );

  assert.deepEqual(lines(call), ["codemode $ cargo build --release"]);
  assert.deepEqual(lines(result), ["✓ 1 call"]);
});

test("codemode joins a few nested calls and counts many", () => {
  const few = render("codemode", {
    code: 'const a = await tools.read({ path: "src/a.ts" });\nconst b = await tools.grep({ pattern: "TODO", path: "src" });',
  });

  assert.deepEqual(lines(few.call), ["codemode read src/a.ts + grep TODO · src"]);

  const many = render("codemode", {
    code: 'tools.bash({command:"ls"}); tools.read({path:"a"}); tools.grep({pattern:"b"}); tools.write({path:"c"});',
  });

  assert.deepEqual(lines(many.call), ["codemode 4 calls: bash, read, grep +1"]);
});

test("codemode resolves constants instead of showing a bare tool name", () => {
  const { call } = render("codemode", {
    code: 'const p = "/repo/src/app.ts";\nconst r = await tools.read({ path: p });',
  });

  assert.deepEqual(lines(call), ["codemode read src/app.ts"]);
});

test("codemode counts a loop over literal files", () => {
  const { call } = render("codemode", {
    code: 'const base = "/repo/src/";\nconst files = ["a.ts", "b.ts", "c.ts"];\nfor (const f of files) {\n  await tools.read({ path: base + f });\n}',
  });

  assert.deepEqual(lines(call), ["codemode read src/* ×3"]);
});

test("codemode summarizes several variable-backed calls", () => {
  const { call } = render("codemode", {
    code: 'const a = "/repo/a.ts";\nconst b = "/repo/b.ts";\nawait Promise.all([tools.write({ path: a, content: "x" }), tools.read({ path: b })]);',
  });

  assert.deepEqual(lines(call), ["codemode write a.ts + read b.ts"]);
});

test("codemode ignores calls inside comments and strings", () => {
  const commented = render("codemode", {
    code: '// tools.bash({ command: "rm -rf /" })\nawait tools.read({ path: "a.ts" });\nreturn 1;',
  });
  assert.deepEqual(lines(commented.call), ["codemode read a.ts"]);

  const quoted = render("codemode", {
    code: 'const s = "tools.bash({ command: \\"rm -rf /\\" })";\nawait tools.read({ path: "a.ts" });\nreturn s;',
  });
  assert.deepEqual(lines(quoted.call), ["codemode read a.ts"]);
});

test("codemode falls back to the meaningful first line", () => {
  const { call } = render("codemode", {
    code: "// @options: {}\n\nconst total = 1 + 2;\nreturn total;",
  });

  assert.deepEqual(lines(call), ["codemode 1 + 2; …"]);
});

test("bash strips cd and environment prefixes", () => {
  const { call } = render("bash", { command: "cd /repo && FOO=1 BAR=2 ls -la" });

  assert.deepEqual(lines(call), ["$ ls -la"]);
});

test("bash marks a multi-line command", () => {
  const { call } = render("bash", { command: "echo a\necho b" });

  assert.deepEqual(lines(call), ["$ echo a …"]);
});

test("bash skips the script prologue and continues after a bare cd", () => {
  const prologue = render("bash", {
    command: "#!/usr/bin/env bash\nset -euo pipefail\nexport FOO=1\ncd /repo\ncargo build\n",
  });

  assert.deepEqual(lines(prologue.call), ["$ cargo build"]);
});

test("codemode reads template-literal commands", () => {
  const { call } = render("codemode", {
    code: "const r = await tools.bash({ command: \x60cd /repo && cargo test\x60 });",
  });

  assert.deepEqual(lines(call), ["codemode $ cargo test"]);
});

test("bash collapses an inline interpreter script", () => {
  const { call } = render("bash", {
    command: "node -e 'const x = 1;\nconsole.log(x);'",
  });

  assert.deepEqual(lines(call), ["$ node -e …"]);
});

test("bash resolves a command held in a constant", () => {
  const { call } = render("codemode", {
    code: 'const cmd = "cd /repo && cargo test";\nawait tools.bash({ command: cmd });',
  });

  assert.deepEqual(lines(call), ["codemode $ cargo test"]);
});

test("bash keeps one error line and the exit code", () => {
  const { result } = render(
    "bash",
    { command: "grep missing" },
    {
      content: [
        {
          type: "text",
          text: "grep: missing: No such file or directory\n\nCommand exited with code 2",
        },
      ],
    },
    { isError: true, durationMs: 1200 },
  );

  assert.deepEqual(lines(result), ["✗ exit 2 · 1.2s", "grep: missing: No such file or directory"]);
});

test("bash hides sub-second timing and marks truncation", () => {
  const { result } = render(
    "bash",
    { command: "ls" },
    { content: [{ type: "text", text: "output" }], details: { fullOutputPath: "/tmp/full.txt" } },
  );

  assert.deepEqual(lines(result), ["✓ done · truncated"]);
});

test("bash stays neutral until arguments complete", () => {
  const renderers = createCompactRenderers("bash", builtIn);
  const state: Record<string, unknown> = {};
  const ctx = (argsComplete: boolean) =>
    context({ args: {}, state, toolCallId: "bash-pending", argsComplete });
  const pending = renderers.renderCall!({}, theme, ctx(false));
  const invalid = renderers.renderCall!({}, theme, ctx(true));

  assert.deepEqual(lines(pending), ["$"]);
  assert.deepEqual(lines(invalid), ["$ [invalid arg]"]);
});

test("read shows the path and range without a second line", () => {
  const { call, result } = render(
    "read",
    { path: "/repo/src/app.ts", offset: 10, limit: 31 },
    {
      content: [
        { type: "text", text: Array.from({ length: 31 }, (_, i) => "line " + i).join("\n") },
      ],
    },
  );

  assert.deepEqual(lines(call), ["read src/app.ts:10-40"]);
  assert.deepEqual(lines(result), []);
});

test("read does not count its truncation notice as a line", () => {
  const { result } = render(
    "read",
    { path: "src/big.ts" },
    {
      content: [
        { type: "text", text: "a\nb\n\n[Showing lines 1-2 of 10. Use offset=3 to continue.]" },
      ],
      details: { truncation: { truncated: true } },
    },
  );

  assert.deepEqual(lines(result), ["✓ 2 lines · truncated"]);
});

test("write and edit show what changed", () => {
  const write = render("write", { path: "/repo/docs/x.md", content: "hello" }, { content: [] });
  assert.deepEqual(lines(write.call), ["write docs/x.md"]);
  assert.deepEqual(lines(write.result), ["✓ written · 5 B"]);

  const edit = render(
    "edit",
    {
      path: "/repo/src/x.ts",
      edits: [
        { oldText: "a", newText: "b" },
        { oldText: "c", newText: "d" },
      ],
    },
    { content: [] },
  );
  assert.deepEqual(lines(edit.call), ["edit src/x.ts · 2 edits"]);
  assert.deepEqual(lines(edit.result), ["✓ 2 edits"]);
});

test("empty find and ls rows say no files and empty", () => {
  const find = render(
    "find",
    { pattern: "*.ts", path: "src" },
    { content: [{ type: "text", text: "No files found matching pattern" }] },
  );
  assert.deepEqual(lines(find.result), ["✓ no files"]);

  const ls = render(
    "ls",
    { path: "src" },
    { content: [{ type: "text", text: "(empty directory)" }] },
  );
  assert.deepEqual(lines(ls.result), ["✓ empty"]);
});

test("grep, find, and ls count their results", () => {
  const grep = render(
    "grep",
    { pattern: "TODO", path: "src", glob: "*.ts" },
    { content: [{ type: "text", text: "src/a.ts:1: TODO\nsrc/b.ts:2: TODO\n" }] },
  );
  assert.deepEqual(lines(grep.call), ["grep TODO · src · *.ts"]);
  assert.deepEqual(lines(grep.result), ["✓ 2 matches"]);

  const find = render(
    "find",
    { pattern: "*.ts", path: "src" },
    { content: [{ type: "text", text: "a.ts\nb.ts\nc.ts" }] },
  );
  assert.deepEqual(lines(find.call), ["find *.ts · src"]);
  assert.deepEqual(lines(find.result), ["✓ 3 files"]);

  const ls = render("ls", { path: "src" }, { content: [{ type: "text", text: "a\nb" }] });
  assert.deepEqual(lines(ls.call), ["ls src"]);
  assert.deepEqual(lines(ls.result), ["✓ 2 entries"]);
});

test("any other tool gets a compact generic row", () => {
  const { call, result } = render("custom_tool", { query: "hello world" }, { content: [] });

  assert.deepEqual(lines(call), ["custom_tool hello world"]);
  assert.deepEqual(lines(result), ["✓ done"]);
});

test("questions and MCP tools get short titles", () => {
  const ask = render("ask_user_question", { questions: [{ question: "Which database?" }] });
  assert.deepEqual(lines(ask.call), ["ask Which database?"]);

  const mcp = render("mcp__wigolo__fetch", { url: "https://example.com/page" });
  assert.deepEqual(lines(mcp.call), ["wigolo:fetch https://example.com/page"]);
});

test("errors keep one actionable line", () => {
  const { result } = render(
    "read",
    { path: "missing.ts" },
    { content: [{ type: "text", text: "ENOENT: no such file or directory" }] },
    { isError: true },
  );

  assert.deepEqual(lines(result), ["✗ failed", "ENOENT: no such file or directory"]);
});

test("line helpers cover missing arguments and note kinds", () => {
  assert.deepEqual(callLine("custom", { text: "", more: false }, theme, true, deps.text), "custom");
  assert.deepEqual(
    statusLine({ status: "ok", label: "done", notes: ["1 failed", "$0.01"] }, 0, theme),
    "✓ done · 1 failed · $0.01",
  );
});

test("expanded calls without a built-in renderer show the full arguments", () => {
  const renderers = createCompactRenderers("recall");
  const call = renderers.renderCall!({ query: "hello" }, theme, context({ expanded: true }));

  assert.deepEqual(lines(call), ["{", '  "query": "hello"', "}"]);
});

test("expanded results of tools without a built-in renderer show the raw text", () => {
  const renderers = createCompactRenderers("recall");
  const result = renderers.renderResult!(
    {
      content: [{ type: "text", text: "1. decisions.md" }],
      details: undefined,
    } as unknown as ResultValue,
    { expanded: true, isPartial: false } as ResultOptions,
    theme,
    context({ expanded: true }),
  );

  assert.deepEqual(lines(result), ["1. decisions.md"]);
});

test("expanded and image results delegate to the built-in renderer", () => {
  const renderers = createCompactRenderers("read", builtIn);
  const expanded = renderers.renderCall!({ path: "a" }, theme, context({ expanded: true }));
  assert.deepEqual(lines(expanded), ["expanded call"]);

  const expandedResult = renderers.renderResult!(
    { content: [{ type: "text", text: "full" }], details: undefined },
    { expanded: true, isPartial: false } as ResultOptions,
    theme,
    context({ expanded: true }),
  );
  assert.deepEqual(lines(expandedResult), ["expanded result"]);

  const image = renderers.renderResult!(
    { content: [{ type: "image", data: "x", mimeType: "image/png" }], details: undefined },
    { expanded: false, isPartial: false },
    theme,
    context(),
  );
  assert.deepEqual(lines(image), ["expanded result"]);
});

const grepOk = {
  content: [{ type: "text", text: "src/a.ts:1: TODO\nsrc/b.ts:2: TODO\n" }],
  details: undefined,
};

const RUNNING = { durationMs: undefined };
const SETTLED = { durationMs: 20 };

test("parallel calls of one tool each keep their own row", () => {
  const first = createRow("grep", { pattern: "TODO", path: "src" });
  const second = createRow("grep", { pattern: "FIXME", path: "lib" });

  assert.deepEqual(first.callLines(RUNNING), ["grep TODO · src"]);
  assert.deepEqual(second.callLines(RUNNING), ["grep FIXME · lib"]);
});

test("each call settles into its own card", () => {
  const first = createRow("grep", { pattern: "TODO", path: "src" });
  const second = createRow("grep", { pattern: "FIXME", path: "lib" });

  assert.deepEqual(first.frame(grepOk, SETTLED), ["grep TODO · src", "✓ 2 matches"]);
  assert.deepEqual(
    second.frame({ content: [{ type: "text", text: "" }], details: undefined }, SETTLED),
    ["grep FIXME · lib", "✓ no matches"],
  );
});

test("bash calls stay on separate rows", () => {
  const first = createRow("bash", { command: "ls" });
  const second = createRow("bash", { command: "pwd" });

  assert.deepEqual(first.callLines(RUNNING), ["$ ls"]);
  assert.deepEqual(second.callLines(RUNNING), ["$ pwd"]);
});

test("a different tool keeps its own row", () => {
  const first = createRow("grep", { pattern: "TODO", path: "src" });
  const other = createRow("read", { path: "src/a.ts" });

  assert.deepEqual(first.callLines(RUNNING), ["grep TODO · src"]);
  assert.deepEqual(other.callLines(RUNNING), ["read src/a.ts"]);
});

test("an error keeps its detail on its own line", () => {
  const row = createRow("grep", { pattern: "FIXME", path: "lib" });

  assert.deepEqual(
    row.frame(
      { content: [{ type: "text", text: "no such file" }], details: undefined },
      { durationMs: 20, isError: true },
    ),
    ["grep FIXME · lib", "✗ failed", "no such file"],
  );
});

test("a settled row is only its compact lines, Pi pads the box", () => {
  const row = createRow("bash", { command: "ls" });
  assert.deepEqual(raw(row.call(SETTLED)), ["$ ls"]);
  assert.deepEqual(raw(row.result({ content: [], details: undefined }, SETTLED)), ["✓ done"]);
  assert.deepEqual(raw({ render: () => row.frame({ content: [], details: undefined }, SETTLED) }), [
    "$ ls",
    "✓ done",
  ]);
});

test("a partial result says it is running", () => {
  const renderers = createCompactRenderers("grep");
  const partial = renderers.renderResult!(
    { content: [], details: undefined },
    { expanded: false, isPartial: true },
    theme,
    context({ isPartial: true }),
  );

  assert.deepEqual(lines(partial), ["… running"]);
});

test("a circular argument set falls back to its string form", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const renderers = createCompactRenderers("recall");
  const call = renderers.renderCall!(circular, theme, context({ expanded: true }));

  assert.deepEqual(lines(call), ["[object Object]"]);
});

test("expanded results handle non-array content and null results", () => {
  const renderers = createCompactRenderers("recall");
  const nonArray = renderers.renderResult!(
    { content: "raw", details: undefined } as unknown as ResultValue,
    { expanded: true, isPartial: false } as ResultOptions,
    theme,
    context({ expanded: true }),
  );
  assert.deepEqual(lines(nonArray), []);

  const nullResult = renderers.renderResult!(
    null as unknown as ResultValue,
    { expanded: false, isPartial: false } as ResultOptions,
    theme,
    context(),
  );
  assert.deepEqual(lines(nullResult), ["✓ done"]);
});

test("expanded calls handle undefined arguments", () => {
  const renderers = createCompactRenderers("recall");
  const call = renderers.renderCall!(undefined, theme, context({ expanded: true }));
  assert.deepEqual(lines(call), ["undefined"]);
});

test("a result cache hit reuses the first summary", () => {
  const row = createRow("grep", { pattern: "TODO" });
  const value = { content: [{ type: "text", text: "a:1: x" }], details: undefined };

  assert.deepEqual(lines(row.result(value)), ["✓ 1 match"]);
  assert.deepEqual(lines(row.result(value)), ["✓ 1 match"]);
  assert.deepEqual(lines(row.call()), ["grep TODO"]);
  assert.deepEqual(lines(row.call()), ["grep TODO"]);
});

test("a running row is one compact line", () => {
  const row = createRow("grep", { pattern: "TODO", path: "src" });

  assert.deepEqual(raw(row.call(RUNNING)), ["grep TODO · src"]);
});

test("a long command wraps inside the row width instead of being cut", () => {
  const { call } = render("bash", { command: "cargo test --workspace --all-features --locked" });
  const painted = lines(call, 32).map(stripTerminalSequences);

  assert.ok(painted.length > 1);
  assert.ok(painted.every((line) => visibleWidth(line) <= 32));
  assert.ok((painted[0] ?? "").startsWith("$ cargo"));
});

test("a command with wide characters wraps inside the row width", () => {
  const { call } = render("bash", { command: "echo " + "日本語テスト".repeat(12) });
  const painted = lines(call, 40).map(stripTerminalSequences);

  assert.ok(painted.length > 1);
  assert.ok(painted.every((line) => visibleWidth(line) <= 40));
});

test("a repaint of the same width reuses the painted lines", () => {
  const { call } = render("bash", { command: "ls -la" });
  const first = call?.render(50);

  assert.equal(call?.render(50), first);
  assert.notEqual(call?.render(51), first);
});

test("Pi's default shell supplies the padding and the indent", () => {
  const row = createRow("bash", { command: "ls" });
  const box = new Box(1, 1, (text) => text);
  box.addChild(row.call(SETTLED)!);
  box.addChild(row.result({ content: [], details: undefined }, SETTLED)!);

  assert.deepEqual(
    box.render(40).map((line) => line.trimEnd()),
    ["", " $ ls", " ✓ done", ""],
  );
});

test("the extension keeps Pi's default shell", () => {
  assert.equal(createCompactRenderers("bash").renderShell, undefined);
  assert.equal(createCompactRenderers("bash", builtIn).renderShell, undefined);
});
