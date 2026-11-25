import type { CallSummary, DomainDeps } from "../contracts.ts";
import { summarizeCommand } from "./command.ts";
import {
  collectConstants,
  findLoops,
  resolveExpression,
  splitTopLevel,
  type Loop,
} from "./expression.ts";

export interface CodeCall {
  tool: string;
  fields: Record<string, string>;
  loopCount?: number;
}

const CALL = /tools\.([A-Za-z_$][\w$]*)\s*\(/g;
const FIELD_KEYS = new Set([
  "command",
  "path",
  "file_path",
  "pattern",
  "query",
  "url",
  "glob",
  "constraints",
]);

export function extractCodeCalls(code: string, deps: DomainDeps): CodeCall[] {
  const calls: CodeCall[] = [];
  const masked = maskNonCode(code);
  const source = stripComments(code);
  const constants = collectConstants(source, deps);
  const loops = findLoops(source);
  CALL.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = CALL.exec(masked)) !== null && calls.length < 16) {
    const open = match.index + match[0].lastIndexOf("(");
    const close = closingIndex(masked, open, "(", ")");
    const args = code.slice(open + 1, close === -1 ? code.length : close);
    const fields: Record<string, string> = {};
    let loopCount: number | undefined;

    for (const [key, expression] of Object.entries(parseFields(args))) {
      const loop = loopFor(expression, loops);
      const resolved = resolveExpression(expression, constants, deps, loop);
      fields[key] = resolved.display;
      if (resolved.loopVariable) loopCount = loop?.count;
    }

    calls.push({ tool: match[1]!, fields, loopCount });
  }

  CALL.lastIndex = 0;
  return calls;
}

export function summarizeCode(
  code: unknown,
  cwd: string | undefined,
  deps: DomainDeps,
): CallSummary {
  if (typeof code !== "string") return { text: "", more: false };

  const calls = extractCodeCalls(code, deps);
  if (calls.length === 0) return codeFallback(code, deps);
  if (calls.length === 1) return { text: callLabel(calls[0]!, cwd, deps), more: false };
  if (calls.length <= 3) {
    return { text: calls.map((call) => callLabel(call, cwd, deps)).join(" + "), more: false };
  }

  const names = calls
    .slice(0, 3)
    .map((call) => call.tool)
    .join(", ");
  return { text: calls.length + " calls: " + names + " +" + (calls.length - 3), more: false };
}

function parseFields(args: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const start = args.indexOf("{");
  if (start === -1) return fields;

  const end = closingIndex(args, start, "{", "}");
  const body = args.slice(start + 1, end === -1 ? args.length : end);

  for (const part of splitTopLevel(body, ",")) {
    const separator = part.indexOf(":");
    if (separator === -1) continue;

    const key = part.slice(0, separator).trim();
    if (!FIELD_KEYS.has(key)) continue;

    const value = part.slice(separator + 1).trim();
    if (value) fields[key] = value;
  }

  return fields;
}

function loopFor(expression: string, loops: Map<string, Loop>): Loop | undefined {
  for (const [name, loop] of loops) {
    if (new RegExp("(?:^|[^\\w$])" + name + "(?:[^\\w$]|$)").test(expression)) return loop;
  }
  return undefined;
}

function callLabel(call: CodeCall, cwd: string | undefined, deps: DomainDeps): string {
  const { tool, fields } = call;
  const loop = call.loopCount ? " ×" + call.loopCount : "";

  if (tool === "bash") {
    const command = summarizeCommand(fields.command, deps).text;
    return command ? "$ " + command + loop : "bash";
  }

  const path = deps.paths.shorten(fields.path ?? fields.file_path, cwd);
  if (tool === "read" || tool === "write" || tool === "edit" || tool === "ls") {
    if (path === "*" && call.loopCount) return tool + " " + call.loopCount + " files";
    return path ? tool + " " + path + loop : tool;
  }

  if (tool === "grep" || tool === "find") {
    const pattern = fields.pattern ? deps.text.quoteValue(fields.pattern) : "";
    const where = path ? " · " + path : "";
    return tool + (pattern ? " " + pattern : "") + where + loop;
  }

  const value =
    fields.command || path || fields.pattern || fields.query || fields.url || fields.glob;
  return value ? tool + " " + deps.text.compressLine(value, 48) : tool;
}

type FrameKind = "code" | "single" | "double" | "template" | "line" | "block";
interface Frame {
  kind: FrameKind;
  template: boolean;
  depth: number;
}

function maskNonCode(code: string): string {
  return maskSource(code, true);
}

function stripComments(code: string): string {
  return maskSource(code, false);
}

function maskSource(code: string, maskStrings: boolean): string {
  const out = code.split("");
  const frames: Frame[] = [{ kind: "code", template: false, depth: 0 }];
  const push = (kind: FrameKind): void => {
    frames.push({ kind, template: false, depth: 0 });
  };
  const mask = (at: number): void => {
    const char = code.charAt(at);
    if (char !== "\n" && char !== "\r") out[at] = " ";
  };

  for (let index = 0; index < code.length; index += 1) {
    const frame = frames.at(-1)!;
    const char = code.charAt(index);

    if (frame.kind === "line") {
      if (char === "\n") frames.pop();
      else mask(index);
      continue;
    }

    if (frame.kind === "block") {
      if (char === "*" && code.charAt(index + 1) === "/") {
        mask(index);
        mask(index + 1);
        frames.pop();
        index += 1;
      } else mask(index);
      continue;
    }

    if (frame.kind === "single" || frame.kind === "double") {
      const quote = frame.kind === "single" ? "'" : '"';
      if (maskStrings) mask(index);
      if (char === "\\") {
        if (maskStrings) mask(index + 1);
        index += 1;
      } else if (char === quote || char === "\n" || char === "\r") frames.pop();
      continue;
    }

    if (frame.kind === "template") {
      if (maskStrings) mask(index);
      if (char === "\\") {
        if (maskStrings) mask(index + 1);
        index += 1;
      } else if (char === "`") frames.pop();
      else if (char === "$" && code.charAt(index + 1) === "{") {
        if (maskStrings) {
          mask(index);
          mask(index + 1);
        }
        frames.push({ kind: "code", template: true, depth: 0 });
        index += 1;
      }
      continue;
    }

    if (char === "/" && code.charAt(index + 1) === "/") {
      mask(index);
      mask(index + 1);
      push("line");
      index += 1;
      continue;
    }

    if (char === "/" && code.charAt(index + 1) === "*") {
      mask(index);
      mask(index + 1);
      push("block");
      index += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      if (maskStrings) mask(index);
      push(char === "'" ? "single" : char === '"' ? "double" : "template");
      continue;
    }

    if (!frame.template) continue;
    if (char === "{") frame.depth += 1;
    else if (char === "}" && frame.depth > 0) frame.depth -= 1;
    else if (char === "}") {
      if (maskStrings) mask(index);
      frames.pop();
    }
  }

  return out.join("");
}

function closingIndex(text: string, open: number, opener: string, closer: string): number {
  let depth = 0;
  let quote = "";

  for (let index = open; index < text.length; index += 1) {
    const char = text[index];

    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }

    if (char === '"' || char === "'" || char === "\x60") {
      quote = char;
      continue;
    }

    if (char === opener) depth += 1;
    else if (char === closer && --depth === 0) return index;
  }

  return -1;
}

function codeFallback(code: string, deps: DomainDeps): CallSummary {
  const assignment = /^(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:await\s+)?/;
  let preview = "";
  let more = false;

  for (const raw of stripComments(code).replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("// @options:")) continue;

    const text = deps.text.compressLine(line.replace(assignment, ""), 60);
    if (!text) continue;
    if (preview) {
      more = true;
      break;
    }
    preview = text;
  }

  return { text: preview, more };
}
