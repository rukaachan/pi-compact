import assert from "node:assert/strict";
import test from "node:test";
import { createTerminal } from "../extensions/compact/adapters/terminal.ts";
import {
  bashErrorDetail as bashErrorDetailWithTools,
  bashExitCode,
  bashStatusLabel,
  codemodeErrorText as codemodeErrorTextWithTools,
  formatCostMicros,
  formatDuration,
  stripScriptHeader,
  summarizeCodemodeCalls,
  textContent,
} from "../extensions/compact/domain/format.ts";
import { createTextTools } from "../extensions/compact/domain/text.ts";

const textTools = createTextTools(createTerminal());
const { clipPreview, compressLine, firstLine } = textTools;
const bashErrorDetail = (text: string) => bashErrorDetailWithTools(text, textTools);
const codemodeErrorText = (text: string) => codemodeErrorTextWithTools(text, textTools);

test("clipPreview strips terminal control sequences", () => {
  assert.equal(clipPreview("\u001b[31mred\u001b[0m"), "red");
  assert.equal(clipPreview("\u001b]8;;https://example.com\u0007link\u001b]8;;\u0007"), "link");
  assert.equal(clipPreview("a\u0007b"), "ab");
  assert.equal(clipPreview("a\u0085b"), "ab");
});

test("format helpers skip lines that are only terminal controls", () => {
  assert.equal(firstLine("\u001b[0m\nconst a = 1;"), "const a = 1;");
  assert.equal(firstLine("\u001b[0m\nError: boom"), "Error: boom");
  assert.equal(
    bashErrorDetail("\u001b[0m\nreal error\n\nCommand exited with code 1"),
    "real error",
  );
});

test("clipPreview does not split a surrogate pair", () => {
  const clipped = clipPreview("a" + "😀".repeat(300));
  const last = clipped.charCodeAt(clipped.length - 1);
  assert.ok(!(last >= 0xd800 && last <= 0xdbff));
});

test("firstLine caps a very long line", () => {
  assert.equal(firstLine("y".repeat(600)).length, 500);
});

test("formatDuration switches from milliseconds to seconds", () => {
  assert.equal(formatDuration(undefined), "");
  assert.equal(formatDuration(67), "67ms");
  assert.equal(formatDuration(999.6), "1.0s");
  assert.equal(formatDuration(1234), "1.2s");
  assert.equal(formatDuration(59_940), "59.9s");
  assert.equal(formatDuration(59_999), "1m 0s");
  assert.equal(formatDuration(90_000), "1m 30s");
  assert.equal(formatDuration(3_600_000), "1h 0m");
});

test("compressLine keeps a surrogate pair intact at the tail", () => {
  const text = "a".repeat(79) + "😀" + "b".repeat(19);
  const clipped = compressLine(text, 72);
  const tail = clipped.slice(clipped.indexOf("…") + 1);

  assert.ok(tail.startsWith("😀"));
});

test("formatCostMicros uses integer micro-dollars", () => {
  assert.equal(formatCostMicros(0), "");
  assert.equal(formatCostMicros(1), "$0.0000010");
  assert.equal(formatCostMicros(2_340), "$0.0023");
  assert.equal(formatCostMicros(9_999), "$0.0099");
  assert.equal(formatCostMicros(420_000), "$0.42");
  assert.equal(formatCostMicros(1_000_000), "$1.00");
  assert.equal(formatCostMicros(1_234_567), "$1.23");
});

test("summarizeCodemodeCalls counts every status and sums cost", () => {
  const summary = summarizeCodemodeCalls(
    [{ status: "ok", cost: 0.01 }, { status: "error" }, { status: "cancelled" }],
    false,
  );

  assert.deepEqual(summary, {
    status: "ok",
    calls: 3,
    failed: 1,
    cancelled: 1,
    truncated: false,
    costMicros: 10_000,
  });
});

test("summarizeCodemodeCalls ignores malformed entries and costs", () => {
  const summary = summarizeCodemodeCalls(
    [
      null as unknown as { status: "ok" },
      { status: "ok", cost: "bad" as unknown as number },
      { status: "ok", cost: 0.01 },
    ],
    false,
  );
  assert.equal(summary.calls, 2);
  assert.equal(summary.costMicros, 10_000);
});

test("summarizeCodemodeCalls adds float costs as integer micro-dollars", () => {
  const summary = summarizeCodemodeCalls(
    [
      { status: "ok", cost: 0.1 },
      { status: "ok", cost: 0.2 },
    ],
    false,
  );

  assert.equal(summary.costMicros, 300_000);
  assert.equal(formatCostMicros(summary.costMicros), "$0.30");
});

test("summarizeCodemodeCalls follows the script result for overall status", () => {
  const summary = summarizeCodemodeCalls([{ status: "ok" }], true);
  assert.equal(summary.status, "error");
});

test("summarizeCodemodeCalls carries the truncation flag", () => {
  const summary = summarizeCodemodeCalls([{ status: "ok" }], false, true);
  assert.equal(summary.truncated, true);
});

test("textContent joins only text blocks", () => {
  const content = [
    { type: "text", text: "first" },
    { type: "image", data: "ignored" },
    { type: "text", text: "second" },
  ];
  assert.equal(textContent(content), "first\nsecond");
});

test("stripScriptHeader removes the codemode result header", () => {
  const text = "Script completed\nWall time 1.2 seconds\nOutput:\nresult";
  assert.equal(stripScriptHeader(text), "result");
});

test("codemodeErrorText returns the first script error line", () => {
  const text =
    "Script failed\nWall time 0.3 seconds\nOutput:\npartial\nScript error:\nError: boom\n\n1 call ok";
  assert.equal(codemodeErrorText(text), "Error: boom");
});

test("codemodeErrorText falls back to the first output line", () => {
  const text = "Script failed\nWall time 0.3 seconds\nOutput:\nTool failed";
  assert.equal(codemodeErrorText(text), "Tool failed");
});

test("bashExitCode and bashStatusLabel read the shell status suffix", () => {
  const text = "grep: missing: No such file or directory\n\nCommand exited with code 2";
  assert.equal(bashExitCode(text), 2);
  assert.equal(bashStatusLabel(text), "exit 2");
});

test("bashStatusLabel names timeouts, aborts, and terminations", () => {
  assert.equal(bashStatusLabel("output\n\nCommand timed out after 30 seconds"), "timed out");
  assert.equal(bashStatusLabel("output\n\nCommand aborted"), "aborted");
  assert.equal(bashStatusLabel("output\n\nCommand terminated without an exit code"), "terminated");
});

test("bashStatusLabel prefers a structured exit code", () => {
  assert.equal(bashStatusLabel("output", 7), "exit 7");
  assert.equal(bashStatusLabel("output", 0), "failed");
});

test("bashStatusLabel ignores status words inside command output", () => {
  assert.equal(
    bashStatusLabel("Command timed out after 30 seconds\n\nCommand exited with code 1"),
    "exit 1",
  );
});

test("bashErrorDetail returns the last output line without the status", () => {
  const text = "grep: missing: No such file or directory\n\nCommand exited with code 2";
  assert.equal(bashErrorDetail(text), "grep: missing: No such file or directory");
});

test("bashErrorDetail shows the root cause above a Python traceback", () => {
  const gateway = [
    'ERROR Get "https://gitlab.com/api/v4/projects/88090325/merge_requests?state=opened": Bad Gateway.',
    "",
    "Traceback (most recent call last):",
    '  File "<stdin>", line 4, in <module>',
    "    data=json.loads(raw[raw.find('['):])",
    "json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)",
    "",
    "Command exited with code 1",
  ].join("\n");
  assert.equal(
    bashErrorDetail(gateway),
    'ERROR Get "https://gitlab.com/api/v4/projects/88090325/merge_requests?state=opened": Bad Gateway.',
  );

  const glab = [
    "glab: HTTP 502",
    "",
    "Traceback (most recent call last):",
    '  File "<stdin>", line 1, in <module>',
    "json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)",
    "",
    "Command exited with code 1",
  ].join("\n");
  assert.equal(bashErrorDetail(glab), "glab: HTTP 502");
});

test("bashErrorDetail keeps the last line when a traceback has no cause", () => {
  const text = [
    "--- MR 173 ---",
    "Traceback (most recent call last):",
    '  File "<string>", line 3, in <module>',
    "json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)",
    "",
    "Command exited with code 1",
  ].join("\n");
  assert.equal(
    bashErrorDetail(text),
    "json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)",
  );
});

test("bashErrorDetail hides the no-output placeholder", () => {
  const text = "(no output)\n\nCommand exited with code 1";
  assert.equal(bashErrorDetail(text), "");
});

test("bashErrorDetail skips a truncation notice above the status", () => {
  const text =
    "line 1\nerror: last real line\n\n[Showing lines 1-2 of 100. Full output: /tmp/full.log]\n\nCommand exited with code 1";
  assert.equal(bashErrorDetail(text), "error: last real line");
});

test("firstLine skips blank lines", () => {
  assert.equal(firstLine("\n\n  hello\nworld"), "hello");
});
