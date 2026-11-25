import type { TextTools } from "../contracts.ts";

export type CodemodeCallStatus = "running" | "ok" | "error" | "cancelled";

export interface CodemodeCallLike {
  status: CodemodeCallStatus;
  cost?: number;
}

export interface CodemodeSummary {
  status: "ok" | "error";
  calls: number;
  failed: number;
  cancelled: number;
  truncated: boolean;
  costMicros: number;
}

export function summarizeCodemodeCalls(
  calls: readonly CodemodeCallLike[],
  isError: boolean,
  truncated = false,
): CodemodeSummary {
  let total = 0;
  let failed = 0;
  let cancelled = 0;
  let costMicros = 0;

  for (const call of calls) {
    if (typeof call !== "object" || call === null) continue;
    total += 1;
    if (call.status === "error") failed += 1;
    if (call.status === "cancelled") cancelled += 1;
    if (typeof call.cost === "number" && Number.isFinite(call.cost) && call.cost > 0) {
      costMicros += Math.round(call.cost * 1_000_000);
    }
  }

  return {
    status: isError ? "error" : "ok",
    calls: total,
    failed,
    cancelled,
    truncated,
    costMicros,
  };
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "";
  const rounded = Math.round(ms);
  if (rounded < 1000) return `${rounded}ms`;
  if (rounded < 60_000) {
    const seconds = (rounded / 1000).toFixed(1);
    return seconds === "60.0" ? "1m 0s" : `${seconds}s`;
  }
  const totalSeconds = Math.floor(rounded / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${totalSeconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatCostMicros(costMicros: number): string {
  if (!Number.isFinite(costMicros) || costMicros <= 0) return "";
  if (costMicros < 10_000) {
    const digits = String(Math.round(costMicros));
    const significant = digits.slice(0, 2).padEnd(2, "0");
    return "$0." + "0".repeat(6 - digits.length) + significant;
  }
  const cents = Math.round(costMicros / 10_000);
  return "$" + Math.floor(cents / 100) + "." + String(cents % 100).padStart(2, "0");
}

export function textContent(content: readonly unknown[]): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (
      typeof item === "object" &&
      item !== null &&
      (item as { type?: unknown }).type === "text" &&
      typeof (item as { text?: unknown }).text === "string"
    ) {
      parts.push((item as { text: string }).text);
    }
  }
  return parts.join("\n");
}

const SCRIPT_HEADER = /^Script (?:completed|failed)\r?\nWall time [\d.]+ seconds\r?\nOutput:\r?\n/;

export function stripScriptHeader(text: string): string {
  return text.replace(SCRIPT_HEADER, "");
}

export function codemodeErrorText(text: string, tools: TextTools): string {
  const marker = "Script error:";
  const at = text.lastIndexOf(marker);
  if (at !== -1) {
    const line = tools.firstLine(text.slice(at + marker.length));
    if (line) return line;
  }
  return tools.firstLine(stripScriptHeader(text));
}

function lastNonEmptyLine(text: string): string {
  const lines = text.replace(/\r/g, "").trimEnd().split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim();
    if (line) return line;
  }
  return "";
}

export function bashExitCode(text: string): number | undefined {
  const match = /^Command exited with code (\d+)$/.exec(lastNonEmptyLine(text));
  const digits = match?.[1];
  return digits ? Number.parseInt(digits, 10) : undefined;
}

export function bashStatusLabel(text: string, exitCode?: number): string {
  const code = exitCode !== undefined && exitCode !== 0 ? exitCode : bashExitCode(text);
  if (code !== undefined && code !== 0) return `exit ${code}`;
  const last = lastNonEmptyLine(text);
  if (/^Command timed out\b/.test(last)) return "timed out";
  if (/^Command aborted\b/.test(last)) return "aborted";
  if (/^Command terminated\b/.test(last)) return "terminated";
  return "failed";
}

function isBashStatusLine(line: string): boolean {
  return /^Command (?:exited with code \d+|timed out\b.*|aborted\b.*|terminated\b.*)$/.test(line);
}

const TRACEBACK_HEADER = "Traceback (most recent call last):";
const CAUSE_LINE = /^(?:ERROR\b|Error\b|error:|fatal:|glab:)/;

export function bashErrorDetail(text: string, tools: TextTools): string {
  const lines = text.replace(/\r/g, "").trimEnd().split("\n");

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim();
    if (!line) continue;
    if (isBashStatusLine(line)) lines.splice(i, 1);
    break;
  }

  const traceback = lines.findIndex((line) => line.trim() === TRACEBACK_HEADER);
  if (traceback > 0) {
    const cause = causeBefore(lines, traceback, tools);
    if (cause) return cause;
  }

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim();
    if (!line) continue;
    if (line === "(no output)") return "";
    if (line.startsWith("[Showing ") || line.startsWith("[Output truncated")) continue;
    const detail = tools.clipPreview(line);
    if (detail) return detail;
  }

  return "";
}

function causeBefore(lines: readonly string[], end: number, tools: TextTools): string {
  for (let i = end - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim();
    if (!line || !CAUSE_LINE.test(line)) continue;
    const detail = tools.clipPreview(line);
    if (detail) return detail;
  }
  return "";
}
