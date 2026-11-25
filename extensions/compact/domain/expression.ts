import type { DomainDeps } from "../contracts.ts";

export interface Loop {
  variable: string;
  count: number;
}

export interface Resolution {
  value?: string;
  display: string;
  loopVariable?: string;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const INTERPOLATION = new RegExp("\\$\\{([A-Za-z_$][\\w$]*)\\}", "g");

export function collectConstants(code: string, deps: DomainDeps): Map<string, string> {
  const entries: [string, string][] = [];
  const declaration = /(?:^|[\n;])\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+);/g;

  let match: RegExpExecArray | null;
  while ((match = declaration.exec(code)) !== null) {
    const name = match[1];
    const value = match[2];
    if (name && value !== undefined) entries.push([name, value]);
  }

  const constants = new Map<string, string>();
  for (let pass = 0; pass < 4; pass += 1) {
    for (const [name, expression] of entries) {
      if (constants.has(name)) continue;
      const resolved = resolveExpression(expression, constants, deps);
      if (resolved.value !== undefined) constants.set(name, resolved.value);
    }
  }
  return constants;
}

export function findLoops(code: string): Map<string, Loop> {
  const loops = new Map<string, Loop>();
  const header =
    /for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s+of\s+([A-Za-z_$][\w$]*)\s*\)/g;

  let match: RegExpExecArray | null;
  while ((match = header.exec(code)) !== null) {
    const variable = match[1]!;
    const source = match[2]!;
    const body = arrayLiteral(code, source);
    if (body === undefined) continue;
    const count = splitTopLevel(body, ",").filter((item) => item.trim()).length;
    if (count > 0) loops.set(variable, { variable, count });
  }
  return loops;
}

export function resolveExpression(
  expression: string,
  constants: Map<string, string>,
  deps: DomainDeps,
  loop?: Loop,
): Resolution {
  const source = expression.trim();
  if (!source) return { display: "" };

  const literal = literalValue(source);
  if (literal !== undefined) return { value: literal, display: literal };

  const parts = splitTopLevel(source, "+");
  if (parts.length > 1) {
    let display = "";
    let value = "";
    let complete = true;
    let loopVariable: string | undefined;

    for (const part of parts) {
      const resolved = resolvePart(part, constants, deps, loop);
      display += resolved.display;
      loopVariable ??= resolved.loopVariable;
      if (resolved.value === undefined) complete = false;
      else value += resolved.value;
    }

    return complete ? { value, display: value, loopVariable } : { display, loopVariable };
  }

  return resolvePart(source, constants, deps, loop);
}

function resolvePart(
  part: string,
  constants: Map<string, string>,
  deps: DomainDeps,
  loop?: Loop,
): Resolution {
  const value = part.trim();
  const literal = literalValue(value);
  if (literal !== undefined) return { value: literal, display: literal };

  if (IDENTIFIER.test(value)) {
    const known = constants.get(value);
    if (known !== undefined) return { value: known, display: known };
    if (loop?.variable === value) return { display: "*", loopVariable: value };
    return { display: "{" + value + "}" };
  }

  if (value.startsWith("\x60") && value.endsWith("\x60")) {
    const body = value.slice(1, -1);
    let loopVariable: string | undefined;
    const display = body.replace(INTERPOLATION, (_all, name: string) => {
      const known = constants.get(name);
      if (known !== undefined) return known;
      if (loop?.variable === name) {
        loopVariable = name;
        return "*";
      }
      return "{" + name + "}";
    });
    const complete = !display.includes("{") && !display.includes("*");
    return { display, value: complete ? display : undefined, loopVariable };
  }

  return { display: deps.text.compressLine(value, 48) };
}

function literalValue(value: string): string | undefined {
  if (NUMBER.test(value)) return value;

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
    return decode(value);
  }

  if (value.startsWith("\x60") && value.endsWith("\x60") && value.length >= 2) {
    const body = value.slice(1, -1);
    return body.includes("$" + "{") ? undefined : body;
  }

  return undefined;
}

function decode(literal: string): string {
  const body = literal.slice(1, -1);
  if (literal[0] !== '"') return body;
  try {
    return JSON.parse(literal) as string;
  } catch {
    return body;
  }
}

function arrayLiteral(code: string, name: string): string | undefined {
  const declaration = new RegExp("(?:const|let|var)\\s+" + name + "\\s*=\\s*\\[([\\s\\S]*?)\\]");
  return declaration.exec(code)?.[1];
}

export function splitTopLevel(text: string, delimiter: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";

  for (let index = 0; index < text.length; index += 1) {
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

    if (char === "(" || char === "[" || char === "{") depth += 1;
    else if (char === ")" || char === "]" || char === "}") depth -= 1;
    else if (char === delimiter && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(text.slice(start));
  return parts;
}
