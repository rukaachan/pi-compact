import { homedir } from "node:os";
import { isAbsolute, relative } from "node:path";
import type { PathPort } from "../contracts.ts";

export function createPaths(): PathPort {
  return { shorten: shortenPath };
}

function shortenPath(value: unknown, cwd?: string): string {
  if (typeof value !== "string") return "";

  let path = value.trim();
  if (!path || path === "." || path === ".." || path === "~" || path.startsWith("~/")) {
    return path;
  }

  if (cwd && isAbsolute(path)) {
    const rel = relative(cwd, path);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) path = rel;
  }

  const home = homedir();
  if (path === home) return "~";
  if (path.startsWith(home + "/")) path = "~" + path.slice(home.length);
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}
