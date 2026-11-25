import { stripTerminalSequences } from "@earendil-works/pi-tui";
import type { TerminalPort } from "../contracts.ts";

// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const INVISIBLE = /[\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

export function createTerminal(): TerminalPort {
  return {
    sanitize(text: string): string {
      return stripTerminalSequences(text).replace(CONTROL_CHARS, "").replace(INVISIBLE, "");
    },
  };
}
