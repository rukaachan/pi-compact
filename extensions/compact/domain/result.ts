import type { DomainDeps, ResultSummary } from "../contracts.ts";
import {
  bashErrorDetail,
  bashStatusLabel,
  codemodeErrorText,
  formatCostMicros,
  summarizeCodemodeCalls,
  textContent,
} from "./format.ts";
import { byteSize, countEntries, plural } from "./text.ts";

export function summarizeResult(
  tool: string,
  result: unknown,
  args: unknown,
  isError: boolean,
  deps: DomainDeps,
): ResultSummary {
  const data = record(result);
  const text = textContent(Array.isArray(data.content) ? data.content : []);
  const details = record(data.details);
  const callArgs = record(args);
  const status = isError ? "error" : "ok";
  const notes = truncationNote(tool, details, text);

  // Bash and codemode have richer status parsers below; every other tool only needs the error.
  if (isError && tool !== "bash" && tool !== "codemode") {
    return { status, label: "failed", notes, detail: deps.text.firstLine(text) };
  }

  switch (tool) {
    case "codemode": {
      const calls = Array.isArray(details.calls) ? details.calls : [];
      const summary = summarizeCodemodeCalls(
        calls as { status: "ok" | "error" | "cancelled" | "running"; cost?: number }[],
        isError,
        notes.length > 0,
      );
      if (summary.failed > 0) notes.push(summary.failed + " failed");
      if (summary.cancelled > 0) notes.push(summary.cancelled + " cancelled");
      const cost = formatCostMicros(summary.costMicros);
      if (cost) notes.push(cost);
      return {
        status,
        label: summary.calls > 0 ? plural(summary.calls, "call") : isError ? "failed" : "done",
        notes,
        detail: isError ? codemodeErrorText(text, deps.text) : undefined,
      };
    }

    case "bash": {
      const exit = exitCode(data.structuredContent);
      return {
        status,
        label: isError ? bashStatusLabel(text, exit) : "done",
        notes,
        detail: isError ? bashErrorDetail(text, deps.text) : undefined,
      };
    }

    case "read":
      return {
        status,
        label: notes.length > 0 ? plural(payloadLines(text), "line") : "",
        notes,
      };

    case "write":
      return {
        status,
        label: "written",
        notes: contentSize(callArgs.content, notes),
      };

    case "edit": {
      const edits = Array.isArray(callArgs.edits) ? callArgs.edits.length : 0;
      return { status, label: edits > 0 ? plural(edits, "edit") : "edited", notes };
    }

    case "grep":
    case "multi_grep": {
      const matches = countMatches(text);
      return {
        status,
        label: matches > 0 ? plural(matches, "match", "matches") : "no matches",
        notes,
      };
    }

    case "find": {
      if (text.trim() === "No files found matching pattern") {
        return { status, label: "no files", notes };
      }
      const files = countEntries(text);
      return { status, label: files > 0 ? plural(files, "file") : "no files", notes };
    }

    case "ls": {
      if (text.trim() === "(empty directory)") return { status, label: "empty", notes };
      const entries = countEntries(text);
      return { status, label: entries > 0 ? plural(entries, "entry", "entries") : "empty", notes };
    }

    case "ask_user_question":
      return { status, label: "answered", notes };

    default:
      return { status, label: "done", notes };
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function exitCode(value: unknown): number | undefined {
  const code = record(value).exit_code;
  return typeof code === "number" && Number.isFinite(code) ? code : undefined;
}

function truncationNote(tool: string, details: Record<string, unknown>, text: string): string[] {
  const truncation = record(details.truncation);
  if (truncation.truncated === true || typeof details.fullOutputPath === "string") {
    return ["truncated"];
  }
  if (tool === "codemode") return [];
  return hasNotice(text) ? ["truncated"] : [];
}

const NOTICE = /\[Showing (?:lines|last) |\[Output truncated|\n\[\d+ more lines/;

// Pi appends or prepends truncation notices, so only the two ends matter.
function hasNotice(text: string): boolean {
  if (text.length <= 4000) return NOTICE.test(text);
  return NOTICE.test(text.slice(0, 2000)) || NOTICE.test(text.slice(-2000));
}

function countMatches(text: string): number {
  let count = 0;
  let start = 0;

  while (start < text.length) {
    const newline = text.indexOf("\n", start);
    const end = newline === -1 ? text.length : newline;
    if (isMatch(text, start, end)) count += 1;
    if (newline === -1) break;
    start = newline + 1;
  }

  return count;
}

function isMatch(text: string, start: number, end: number): boolean {
  const colon = text.indexOf(":", start);
  if (colon === -1 || colon >= end) return false;

  let at = colon + 1;
  const digits = at;
  while (at < end && text.charCodeAt(at) >= 48 && text.charCodeAt(at) <= 57) at += 1;

  return at > digits && at < end && text.charCodeAt(at) === 58;
}

function payloadLines(text: string): number {
  if (!text) return 0;

  const lines = text.replace(/\r/g, "").split("\n");
  let count = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (isNotice(line)) {
      // Drop the blank separator that precedes a notice appended to file content.
      if (index > 0 && lines[index - 1] === "" && count > 0) count -= 1;
      continue;
    }
    count += 1;
  }

  return text.endsWith("\n") ? Math.max(0, count - 1) : count;
}

function isNotice(line: string): boolean {
  return (
    line.startsWith("[Showing ") ||
    line.startsWith("[Output truncated") ||
    /^\[\d+ more lines/.test(line)
  );
}

function contentSize(content: unknown, notes: string[]): string[] {
  if (typeof content !== "string" || content.length === 0) return notes;
  return [...notes, byteSize(content)];
}
