import type { TerminalPort, TextTools } from "../contracts.ts";

const PREVIEW_CHARS = 500;
const utf8 = new TextEncoder();

export function createTextTools(terminal: TerminalPort): TextTools {
  const clipPreview = (text: string): string => {
    const clean = terminal.sanitize(text);
    if (clean.length <= PREVIEW_CHARS) return clean;

    let end = PREVIEW_CHARS;
    const code = clean.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) end -= 1;
    return clean.slice(0, end);
  };

  const firstLine = (text: string): string => {
    for (const line of text.replace(/\r/g, "").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const preview = clipPreview(trimmed);
      if (preview) return preview;
    }
    return "";
  };

  const clipEnd = (value: unknown, max: number): string => {
    if (typeof value !== "string") return "";
    const clean = clipPreview(value).replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;

    let cut = clean.slice(0, Math.max(1, max - 1));
    const code = cut.charCodeAt(cut.length - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut = cut.slice(0, -1);
    return cut.trimEnd() + "…";
  };

  const compressLine = (value: unknown, max = 72): string => {
    if (typeof value !== "string") return "";
    const clean = clipPreview(value).replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;

    const head = Math.max(8, max - 22);
    let cut = clean.slice(0, head);
    const code = cut.charCodeAt(cut.length - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut = cut.slice(0, -1);

    let tailStart = Math.max(0, clean.length - 20);
    const low = clean.charCodeAt(tailStart);
    if (tailStart > 0 && low >= 0xdc00 && low <= 0xdfff) tailStart -= 1;
    return cut + "…" + clean.slice(tailStart);
  };

  const quoteValue = (value: string): string => {
    const clean = compressLine(value, 48);
    return /\s/.test(clean) ? JSON.stringify(clean) : clean;
  };

  return { clipPreview, firstLine, clipEnd, compressLine, quoteValue };
}

export function countEntries(text: string): number {
  let count = 0;
  let start = 0;

  while (start <= text.length) {
    const newline = text.indexOf("\n", start);
    const end = newline === -1 ? text.length : newline;
    if (isEntry(text, start, end)) count += 1;
    if (newline === -1) break;
    start = newline + 1;
  }

  return count;
}

function isEntry(text: string, start: number, end: number): boolean {
  let from = start;
  while (from < end && (text.charCodeAt(from) === 32 || text.charCodeAt(from) === 9)) from += 1;

  let to = end;
  while (to > from && (text.charCodeAt(to - 1) === 32 || text.charCodeAt(to - 1) === 9)) to -= 1;

  if (from === to) return false;
  return !text.startsWith("[Showing ", from) && !text.startsWith("[Output truncated", from);
}

export function byteSize(text: string): string {
  const bytes = utf8.encode(text).length;
  if (bytes < 1024) return bytes + " B";
  if (bytes < 10240) return (bytes / 1024).toFixed(1) + " KB";
  return Math.round(bytes / 1024) + " KB";
}

export function plural(count: number, one: string, many = one + "s"): string {
  return count + " " + (count === 1 ? one : many);
}
