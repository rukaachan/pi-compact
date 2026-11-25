import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ToolRenderers } from "@earendil-works/pi-coding-agent";
import register from "../extensions/index.ts";

test("the extension registers a renderer resolver and uses the next renderer", () => {
  let resolver:
    | ((toolName: string, next: () => ToolRenderers | undefined) => ToolRenderers)
    | undefined;
  const api = {
    registerToolRenderer(value: typeof resolver) {
      resolver = value;
    },
  } as unknown as ExtensionAPI;

  register(api);
  assert.ok(resolver);

  let nextCalled = false;
  const built: ToolRenderers = {};
  const renderers = resolver("read", () => {
    nextCalled = true;
    return built;
  });

  assert.equal(nextCalled, true);
  assert.ok(renderers.renderCall);
  assert.ok(renderers.renderResult);
});
