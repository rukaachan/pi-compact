import assert from "node:assert/strict";
import test from "node:test";
import {
  bashErrorDetail,
  bashExitCode,
  bashStatusLabel,
  codemodeErrorText,
  formatCostMicros,
  formatDuration,
  stripScriptHeader,
  summarizeCodemodeCalls,
  textContent,
} from "../extensions/compact/domain/format.ts";
import { deps } from "./support/deps.ts";

test("formatDuration rejects invalid values and shows hours", () => {
  assert.equal(formatDuration(-1), "");
  assert.equal(formatDuration(Number.NaN), "");
  assert.equal(formatDuration(Number.POSITIVE_INFINITY), "");
  assert.equal(formatDuration(0), "0ms");
  assert.equal(formatDuration(60_000), "1m 0s");
  assert.equal(formatDuration(7_380_000), "2h 3m");
});

test("formatCostMicros rejects invalid values and keeps small costs", () => {
  assert.equal(formatCostMicros(-1), "");
  assert.equal(formatCostMicros(Number.NaN), "");
  assert.equal(formatCostMicros(Number.POSITIVE_INFINITY), "");
  assert.equal(formatCostMicros(10), "$0.000010");
  assert.equal(formatCostMicros(10_000), "$0.01");
});

test("summarizeCodemodeCalls ignores malformed entries and costs", () => {
  const summary = summarizeCodemodeCalls(
    [
      null,
      "bad",
      { status: "ok", cost: Number.NaN },
      { status: "ok", cost: -1 },
      { status: "ok", cost: Number.POSITIVE_INFINITY },
    ] as unknown as { status: "ok"; cost?: number }[],
    false,
  );
  assert.deepEqual(summary, {
    status: "ok",
    calls: 3,
    failed: 0,
    cancelled: 0,
    truncated: false,
    costMicros: 0,
  });
});

test("textContent ignores non-arrays and non-text blocks", () => {
  assert.equal(textContent("bad" as unknown as readonly unknown[]), "");
  assert.equal(
    textContent([null, "bad", { type: "text", text: 1 }, { type: "text", text: "ok" }]),
    "ok",
  );
});

test("stripScriptHeader handles CRLF and plain text", () => {
  assert.equal(stripScriptHeader("Script failed\r\nWall time 0.1 seconds\r\nOutput:\r\nx"), "x");
  assert.equal(stripScriptHeader("plain"), "plain");
});

test("codemodeErrorText falls back when the marker has no line", () => {
  assert.equal(codemodeErrorText("Script error:", deps.text), "Script error:");
  assert.equal(codemodeErrorText("", deps.text), "");
});

test("bash status helpers handle missing status", () => {
  assert.equal(bashExitCode(""), undefined);
  assert.equal(bashExitCode("plain output"), undefined);
  assert.equal(bashExitCode("Command exited with code 0"), 0);
  assert.equal(bashStatusLabel(""), "failed");
  assert.equal(bashStatusLabel("plain output"), "failed");
});

test("bashErrorDetail handles empty, placeholder, and truncation lines", () => {
  assert.equal(bashErrorDetail("", deps.text), "");
  assert.equal(bashErrorDetail("\n\nCommand exited with code 1", deps.text), "");
  assert.equal(bashErrorDetail("last\n\nCommand exited with code 1", deps.text), "last");
  assert.equal(bashErrorDetail("(no output)\n\nCommand exited with code 1", deps.text), "");
  assert.equal(bashErrorDetail("output\n[Showing lines 1-2]\n(no output)", deps.text), "");
  assert.equal(bashErrorDetail("output\n[Output truncated]\nreal", deps.text), "real");
  assert.equal(bashErrorDetail("[Showing lines 1-2]", deps.text), "");
});

test("bashErrorDetail handles a traceback at the top and a fatal cause", () => {
  const top = [
    "Traceback (most recent call last):",
    '  File "<string>", line 1, in <module>',
    "ValueError: bad",
    "",
    "Command exited with code 1",
  ].join("\n");
  assert.equal(bashErrorDetail(top, deps.text), "ValueError: bad");

  const fatal = [
    "fatal: bad",
    "",
    "Traceback (most recent call last):",
    '  File "<string>", line 1, in <module>',
    "ValueError: bad",
    "",
    "Command exited with code 1",
  ].join("\n");
  assert.equal(bashErrorDetail(fatal, deps.text), "fatal: bad");
});
