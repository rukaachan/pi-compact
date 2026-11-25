import { createPaths } from "../../extensions/compact/adapters/paths.ts";
import { createTerminal } from "../../extensions/compact/adapters/terminal.ts";
import type { DomainDeps } from "../../extensions/compact/contracts.ts";
import { createTextTools } from "../../extensions/compact/domain/text.ts";

export function createDeps(): DomainDeps {
  return {
    paths: createPaths(),
    text: createTextTools(createTerminal()),
  };
}

export const deps = createDeps();
