import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCompactRenderers } from "./compact/adapters/renderer.ts";

export default function (pi: ExtensionAPI): void {
  pi.registerToolRenderer((toolName, next) => createCompactRenderers(toolName, next()));
}
