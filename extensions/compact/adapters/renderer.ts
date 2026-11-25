import type { Theme, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { CallSummary, DomainDeps, ResultSummary } from "../contracts.ts";
import { summarizeCall } from "../domain/call.ts";
import { textContent } from "../domain/format.ts";
import { summarizeResult } from "../domain/result.ts";
import { createTextTools } from "../domain/text.ts";
import { callLine, statusLine } from "./lines.ts";
import { createPaths } from "./paths.ts";
import { createTerminal } from "./terminal.ts";
import { noteStart, stopTimer } from "./timer.ts";

interface RowCache {
  call?: { args: unknown; summary: CallSummary };
  result?: {
    content: unknown;
    details: unknown;
    args: unknown;
    error: boolean;
    summary: ResultSummary;
  };
}

const deps: DomainDeps = {
  paths: createPaths(),
  text: createTextTools(createTerminal()),
};

export function createCompactRenderers(tool: string, builtIn?: ToolRenderers): ToolRenderers {
  return {
    renderCall(args, theme, context) {
      if (context.expanded) {
        if (builtIn?.renderCall) return builtIn.renderCall(args, theme, isolated(context));
        return new Text(prettyArgs(args), 0, 0);
      }
      noteStart(context);
      const state = context.state as RowCache;
      const summary = cachedCall(state, tool, args, context.cwd);
      return new Text(callLine(tool, summary, theme, context.argsComplete, deps.text), 0, 0);
    },

    renderResult(result, options, theme, context) {
      if (options.expanded) {
        return expandedResult(result, options, theme, context, builtIn);
      }

      if (hasImage(result) && builtIn?.renderResult) {
        return builtIn.renderResult(result, options, theme, isolated(context));
      }

      stopTimer(context, !options.isPartial);

      if (options.isPartial) {
        return new Text(theme.fg("warning", "… running"), 0, 0);
      }

      const state = context.state as RowCache;
      const isError =
        context.isError === true ||
        (typeof result === "object" && result !== null && result.isError === true);
      const summary = cachedResult(state, tool, result, context.args, isError);
      const detail = summary.detail ? deps.text.clipEnd(summary.detail, 160) : "";

      if (tool === "read" && !isError && summary.notes.length === 0) return new Text("", 0, 0);

      const lines = [statusLine(summary, context.durationMs, theme)];
      if (detail) lines.push(theme.fg("error", detail));
      return new Text(lines.join("\n"), 0, 0);
    },
  };
}

function prettyArgs(args: unknown): string {
  try {
    return JSON.stringify(args, null, 2) ?? String(args);
  } catch {
    return String(args);
  }
}

type ResultArgs = Parameters<NonNullable<ToolRenderers["renderResult"]>>;

function expandedResult(
  result: ResultArgs[0],
  options: ResultArgs[1],
  theme: Theme,
  context: ResultArgs[3],
  builtIn: ToolRenderers | undefined,
): ReturnType<NonNullable<ToolRenderers["renderResult"]>> {
  if (builtIn?.renderResult) {
    return builtIn.renderResult(result, options, theme, isolated(context));
  }

  const content = (result as { content?: unknown }).content;
  const full = Array.isArray(content) ? textContent(content) : "";
  return new Text(full, 0, 0);
}

function cachedCall(
  cache: RowCache,
  tool: string,
  args: unknown,
  cwd: string | undefined,
): CallSummary {
  if (cache.call && cache.call.args === args) return cache.call.summary;

  const summary = summarizeCall(tool, args, cwd, deps);
  cache.call = { args, summary };
  return summary;
}

function cachedResult(
  cache: RowCache,
  tool: string,
  result: unknown,
  args: unknown,
  isError: boolean,
): ResultSummary {
  const data = typeof result === "object" && result !== null ? result : {};
  const content = (data as { content?: unknown }).content;
  const details = (data as { details?: unknown }).details;
  const previous = cache.result;

  if (
    previous &&
    previous.content === content &&
    previous.details === details &&
    previous.args === args &&
    previous.error === isError
  ) {
    return previous.summary;
  }

  const summary = summarizeResult(tool, result, args, isError, deps);
  cache.result = { content, details, args, error: isError, summary };
  return summary;
}

function hasImage(result: unknown): boolean {
  if (typeof result !== "object" || result === null) return false;
  const content = (result as { content?: unknown }).content;
  return (
    Array.isArray(content) &&
    content.some(
      (item) =>
        typeof item === "object" && item !== null && (item as { type?: unknown }).type === "image",
    )
  );
}

function isolated<T>(context: T): T {
  return { ...context, lastComponent: undefined } as T;
}
