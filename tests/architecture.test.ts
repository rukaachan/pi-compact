import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as contracts from "../extensions/compact/contracts.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "extensions");

test("contracts module loads at runtime", () => {
  assert.equal(typeof contracts, "object");
});
const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^"']*?\sfrom\s+)?["']([^"']+)["']/g;

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

function imports(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT)) {
    const specifier = match[1];
    if (specifier) found.push(specifier);
  }
  return found;
}

function modulePath(from: string, specifier: string): string {
  const target = resolve(dirname(from), specifier);
  return relative(root, target).split(sep).join("/");
}

test("domain imports only domain and type-only contracts", async () => {
  const files = await sourceFiles(join(root, "compact", "domain"));
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const blocks = source.match(/import[\s\S]*?from\s+["'][^"']+["'];/g) ?? [];
    for (const block of blocks) {
      const specifier = /from\s+["']([^"']+)["']/.exec(block)?.[1] ?? "";
      assert.ok(!specifier.startsWith("node:"), file + " imports " + specifier);
      assert.ok(!specifier.startsWith("@earendil-works/"), file + " imports " + specifier);
      assert.ok(!specifier.includes("adapters"), file + " imports " + specifier);
      assert.ok(!specifier.startsWith("../../"), file + " imports " + specifier);
      if (specifier === "../contracts.ts") assert.ok(block.startsWith("import type "), file);
    }
  }
});

test("relative imports have no cycles", async () => {
  const files = await sourceFiles(root);
  const graph = new Map<string, string[]>();

  for (const file of files) {
    const source = await readFile(file, "utf8");
    graph.set(
      relative(root, file).split(sep).join("/"),
      imports(source)
        .filter((specifier) => specifier.startsWith("."))
        .map((specifier) => modulePath(file, specifier)),
    );
  }

  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (file: string): void => {
    if (visiting.has(file)) throw new Error("cycle at " + file);
    if (done.has(file)) return;
    visiting.add(file);
    for (const next of graph.get(file) ?? []) visit(next);
    visiting.delete(file);
    done.add(file);
  };

  for (const file of graph.keys()) visit(file);
});

test("every source folder stays at seven files or fewer", async () => {
  const directories = [root];
  for (let index = 0; index < directories.length; index += 1) {
    const dir = directories[index];
    if (!dir) continue;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) directories.push(join(dir, entry.name));
    }
    const count = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".ts")).length;
    assert.ok(count <= 7, dir + " has " + count + " files");
  }

  const domain = await readdir(join(root, "compact", "domain"));
  const adapters = await readdir(join(root, "compact", "adapters"));
  const compact = await readdir(join(root, "compact"));
  assert.equal(domain.filter((name) => name.endsWith(".ts")).length, 7);
  assert.equal(adapters.filter((name) => name.endsWith(".ts")).length, 5);
  assert.equal(compact.filter((name) => name.endsWith(".ts")).length, 1);
});

test("entrypoint imports only the renderer adapter", async () => {
  const source = await readFile(join(root, "index.ts"), "utf8");
  assert.deepEqual(
    imports(source).filter((specifier) => specifier.startsWith(".")),
    ["./compact/adapters/renderer.ts"],
  );
});
