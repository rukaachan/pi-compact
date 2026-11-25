import type { CallSummary, DomainDeps } from "../contracts.ts";

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+/;
const CD_PREFIX = /^cd\s+(?:"([^"]*)"|'([^']*)'|(\S+))\s*(?:&&|;)\s*(.*)$/;
const BARE_CD = /^cd\s+(?:"([^"]*)"|'([^']*)'|(\S+))\s*$/;
const SHELL_WRAPPER = /^(?:bash|sh|zsh)\s+(?:-lc|-c)\s+(?:"([^"]*)"|'([^']*)'|(\S+))\s*$/;
const PROLOGUE = /^(?:set\s+-|#!|export\s+[A-Za-z_][A-Za-z0-9_]*=|umask\s)/;
const INLINE_SCRIPT =
  /^(node|bun|deno|python[0-9.]*|ruby|perl|php|pwsh|powershell)\s+(-e|--eval|-c)\b/;

export function summarizeCommand(command: unknown, deps: DomainDeps): CallSummary {
  if (typeof command !== "string") return { text: "", more: false };

  const lines = command.replace(/\r/g, "").split("\n");
  let index = nextMeaningful(lines, 0);
  if (index === -1) return { text: "", more: false };

  let line = lines[index]!.trim();
  let directory = "";

  const bare = BARE_CD.exec(line);
  if (bare) {
    const next = nextMeaningful(lines, index + 1);
    if (next !== -1) {
      directory = bare[1] ?? bare[2] ?? bare[3] ?? "";
      index = next;
      line = lines[index]!.trim();
    }
  }

  let more = nextMeaningful(lines, index + 1) !== -1;

  for (let guard = 0; guard < 8; guard += 1) {
    const env = ENV_ASSIGNMENT.exec(line);
    if (env) {
      line = line.slice(env[0].length);
      continue;
    }

    const cd = CD_PREFIX.exec(line);
    if (cd) {
      directory = cd[1] ?? cd[2] ?? cd[3] ?? "";
      line = (cd[4] ?? "").trim();
      continue;
    }
    break;
  }

  const wrapped = SHELL_WRAPPER.exec(line);
  if (wrapped) line = wrapped[1] ?? wrapped[2] ?? wrapped[3] ?? "";

  const inline = INLINE_SCRIPT.exec(line);
  if (inline) return { text: inline[1] + " " + inline[2] + " …", more: false };

  const heredoc = line.indexOf("<<");
  if (heredoc !== -1) {
    line = line.slice(0, heredoc).trim();
    more = true;
  }

  if (!line) {
    return directory
      ? { text: "cd " + deps.paths.shorten(directory), more: false }
      : { text: "", more: false };
  }

  return { text: deps.text.clipEnd(line, 400), more };
}

function nextMeaningful(lines: string[], from: number): number {
  for (let index = from; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line || PROLOGUE.test(line)) continue;
    return index;
  }
  return -1;
}
