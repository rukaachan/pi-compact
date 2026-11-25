import type { CallSummary, DomainDeps } from "../contracts.ts";
import { summarizeCode } from "./code.ts";
import { summarizeCommand } from "./command.ts";
import { plural } from "./text.ts";

export function toolTitle(tool: string): string {
  if (tool.startsWith("mcp__")) {
    const [, server = "mcp", name = tool] = tool.split("__");
    return server + ":" + name;
  }

  switch (tool) {
    case "ask_user_question":
      return "ask";
    case "tool_search":
      return "tools";
    case "create_goal":
      return "goal:create";
    case "get_goal":
      return "goal:get";
    case "update_goal":
      return "goal:update";
    case "TaskOutput":
      return "task:output";
    case "Task":
      return "task";
    default:
      return tool;
  }
}

export function summarizeCall(
  tool: string,
  args: unknown,
  cwd: string | undefined,
  deps: DomainDeps,
): CallSummary {
  const value = record(args);

  switch (tool) {
    case "codemode":
      return summarizeCode(value.code, cwd, deps);

    case "bash": {
      const command = summarizeCommand(value.command, deps);
      return { text: command.text, more: command.more };
    }

    case "read":
      return withPath(value.path, cwd, lineRange(value.offset, value.limit), deps);

    case "write":
    case "ls":
      return withPath(value.path, cwd, "", deps);

    case "edit": {
      const count = Array.isArray(value.edits) ? value.edits.length : 0;
      return withPath(value.path, cwd, count > 0 ? " · " + plural(count, "edit") : "", deps);
    }

    case "grep":
    case "find": {
      const pattern = typeof value.pattern === "string" ? deps.text.quoteValue(value.pattern) : "";
      const where = deps.paths.shorten(value.path, cwd);
      const glob = typeof value.glob === "string" ? " · " + value.glob : "";
      const text = [pattern, where].filter(Boolean).join(" · ");
      return text ? { text: text + (tool === "grep" ? glob : ""), more: false } : empty();
    }

    case "multi_grep": {
      const patterns = Array.isArray(value.patterns)
        ? value.patterns.filter((item): item is string => typeof item === "string")
        : [];
      const text = patterns
        .slice(0, 2)
        .map((pattern) => deps.text.quoteValue(pattern))
        .join(", ");
      const extra = patterns.length > 2 ? " +" + (patterns.length - 2) : "";
      const where = deps.paths.shorten(value.constraints ?? value.path, cwd);
      return text ? { text: text + extra + (where ? " · " + where : ""), more: false } : empty();
    }

    case "tool_search":
      return textSummary(value.query, 60, deps);

    case "recall":
      return textSummary(value.query, 60, deps);

    case "advisor":
      return textSummary(value.question, 60, deps);

    case "ask_user_question": {
      const questions = Array.isArray(value.questions) ? value.questions : [];
      const first = record(questions[0]);
      const text = textSummary(first.question, 64, deps);
      if (!text.text) return empty();
      const extra = questions.length > 1 ? " +" + (questions.length - 1) : "";
      return { text: text.text + extra, more: false };
    }

    case "get_goal": {
      const section = typeof value.section === "string" ? value.section : "";
      const task = typeof value.task_id === "string" ? value.task_id : "";
      return textSummary(section || task, 60, deps);
    }

    case "create_goal":
      return textSummary(value.objective, 60, deps);

    case "update_goal":
      return textSummary(value.task_id ?? value.section, 60, deps);

    case "Task": {
      const agent = typeof value.subagent_type === "string" ? value.subagent_type : "";
      const chain = Array.isArray(value.chain) ? value.chain.join(" → ") : "";
      const prompt = deps.text.compressLine(value.prompt, 48);
      const label = agent || chain || prompt;
      return label ? { text: label, more: Boolean(prompt && label !== prompt) } : empty();
    }

    case "subagent": {
      const agent = typeof value.agent === "string" ? value.agent : "";
      return agent ? { text: agent, more: false } : textSummary(value.task, 60, deps);
    }

    case "TaskOutput":
      return textSummary(value.task_id, 40, deps);

    default:
      return generic(value, deps);
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function empty(): CallSummary {
  return { text: "", more: false };
}

function withPath(
  path: unknown,
  cwd: string | undefined,
  suffix: string,
  deps: DomainDeps,
): CallSummary {
  const text = deps.paths.shorten(path, cwd);
  return text ? { text: text + suffix, more: false } : empty();
}

function textSummary(value: unknown, max: number, deps: DomainDeps): CallSummary {
  const text = deps.text.compressLine(value, max);
  return text ? { text, more: false } : empty();
}

function lineRange(offset: unknown, limit: unknown): string {
  const start = typeof offset === "number" && offset > 0 ? Math.floor(offset) : 0;
  const count = typeof limit === "number" && limit > 0 ? Math.floor(limit) : 0;
  if (start && count) return ":" + start + "-" + (start + count - 1);
  if (start) return ":" + start + "+";
  if (count) return ":1-" + count;
  return "";
}

function generic(value: Record<string, unknown>, deps: DomainDeps): CallSummary {
  const keys = [
    "description",
    "query",
    "question",
    "prompt",
    "path",
    "command",
    "pattern",
    "url",
    "name",
  ];
  for (const key of keys) {
    const text = deps.text.compressLine(value[key], 56);
    if (text) return { text, more: false };
  }

  if (Array.isArray(value.patterns)) {
    const text = deps.text.compressLine(
      value.patterns.filter((item) => typeof item === "string").join(", "),
      56,
    );
    if (text) return { text, more: false };
  }

  const pairs = Object.entries(value)
    .filter(
      ([, item]) =>
        typeof item === "string" || typeof item === "number" || typeof item === "boolean",
    )
    .slice(0, 2)
    .map(([key, item]) => key + "=" + deps.text.compressLine(String(item), 28));
  return pairs.length > 0 ? { text: pairs.join(" "), more: false } : empty();
}
