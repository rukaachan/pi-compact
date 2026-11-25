import type { Theme } from "@earendil-works/pi-coding-agent";
import type { CallSummary, ResultSummary, TextTools } from "../contracts.ts";
import { toolTitle } from "../domain/call.ts";
import { formatDuration } from "../domain/format.ts";

export const REQUIRES_ARGUMENT = new Set([
  "bash",
  "read",
  "write",
  "edit",
  "grep",
  "find",
  "codemode",
]);

export function callLine(
  tool: string,
  summary: CallSummary,
  theme: Theme,
  argsComplete: boolean,
  text: TextTools,
): string {
  const title = theme.fg("toolTitle", theme.bold(tool === "bash" ? "$" : toolTitle(tool)));

  if (!summary.text) {
    if (!argsComplete) return title;
    return REQUIRES_ARGUMENT.has(tool) ? title + " " + theme.fg("error", "[invalid arg]") : title;
  }

  const body = text.clipEnd(summary.text, 200);
  return title + " " + theme.fg("muted", body) + (summary.more ? theme.fg("dim", " …") : "");
}

export function statusLine(
  summary: ResultSummary,
  durationMs: number | undefined,
  theme: Theme,
): string {
  const failed = summary.status === "error";
  const icon = failed ? theme.fg("error", "✗") : theme.fg("success", "✓");
  const parts = [theme.fg(failed ? "error" : "muted", summary.label)];

  for (const note of summary.notes) {
    if (note === "truncated") parts.push(theme.fg("warning", note));
    else if (note.endsWith(" failed")) parts.push(theme.fg("error", note));
    else parts.push(theme.fg("dim", note));
  }

  if (durationMs !== undefined && durationMs >= 1000) {
    parts.push(theme.fg("dim", formatDuration(durationMs)));
  }

  return icon + " " + parts.join(theme.fg("dim", " · "));
}
