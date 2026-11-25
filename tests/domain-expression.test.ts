import assert from "node:assert/strict";
import test from "node:test";
import {
  collectConstants,
  findLoops,
  resolveExpression,
  splitTopLevel,
} from "../extensions/compact/domain/expression.ts";
import { deps } from "./support/deps.ts";

test("collectConstants resolves constants through each other", () => {
  const code = [
    'const a = "x";',
    'const b = a + "y";',
    'const a = "z";',
    "const c = unknown;",
    "const d = 'q';",
    "const e = \x60hi\x60;",
  ].join("\n");
  const constants = collectConstants(code, deps);

  assert.equal(constants.get("a"), "x");
  assert.equal(constants.get("b"), "xy");
  assert.equal(constants.get("d"), "q");
  assert.equal(constants.get("e"), "hi");
  assert.equal(constants.has("c"), false);
});

test("findLoops counts literal arrays", () => {
  const code = [
    'const files = ["a", "b", "c"];',
    "for (const file of files) {}",
    "for (const missing of nowhere) {}",
    "const empty = [];",
    "for (const item of empty) {}",
  ].join("\n");
  const loops = findLoops(code);

  assert.deepEqual(loops.get("file"), { variable: "file", count: 3 });
  assert.equal(loops.has("missing"), false);
  assert.equal(loops.has("item"), false);
});

test("resolveExpression handles literals and empty values", () => {
  assert.deepEqual(resolveExpression("", new Map(), deps), { display: "" });
  assert.deepEqual(resolveExpression("42", new Map(), deps), { value: "42", display: "42" });
  assert.deepEqual(resolveExpression('"two words"', new Map(), deps), {
    value: "two words",
    display: "two words",
  });
  assert.deepEqual(resolveExpression("'single'", new Map(), deps), {
    value: "single",
    display: "single",
  });
  assert.deepEqual(resolveExpression("\x60plain\x60", new Map(), deps), {
    value: "plain",
    display: "plain",
  });
  assert.deepEqual(resolveExpression('"a\\q"', new Map(), deps), {
    value: "a\\q",
    display: "a\\q",
  });
});

test("resolveExpression resolves identifiers, loops, and unknowns", () => {
  const constants = new Map([["known", "value"]]);
  const loop = { variable: "item", count: 3 };

  assert.deepEqual(resolveExpression("known", constants, deps), {
    value: "value",
    display: "value",
  });
  assert.deepEqual(resolveExpression("item", constants, deps, loop), {
    display: "*",
    loopVariable: "item",
  });
  assert.deepEqual(resolveExpression("unknown", constants, deps), {
    display: "{unknown}",
  });
  assert.deepEqual(resolveExpression("call(one)", constants, deps), {
    display: "call(one)",
  });
});

test("resolveExpression joins complete and partial concatenations", () => {
  const constants = new Map([["base", "/repo"]]);

  assert.deepEqual(resolveExpression('base + "/src"', constants, deps), {
    value: "/repo/src",
    display: "/repo/src",
    loopVariable: undefined,
  });
  assert.deepEqual(resolveExpression("base + unknown", constants, deps), {
    display: "/repo{unknown}",
    loopVariable: undefined,
  });
});

test("resolveExpression resolves template literals", () => {
  const constants = new Map([["name", "world"]]);
  const loop = { variable: "item", count: 2 };

  assert.deepEqual(resolveExpression("\x60hi ${name}\x60", constants, deps), {
    value: "hi world",
    display: "hi world",
    loopVariable: undefined,
  });
  assert.deepEqual(resolveExpression("\x60hi ${item}\x60", constants, deps, loop), {
    display: "hi *",
    value: undefined,
    loopVariable: "item",
  });
  assert.deepEqual(resolveExpression("\x60hi ${unknown}\x60", constants, deps), {
    display: "hi {unknown}",
    value: undefined,
    loopVariable: undefined,
  });
});

test("splitTopLevel ignores nested brackets and quotes", () => {
  assert.deepEqual(splitTopLevel("a,b,c", ","), ["a", "b", "c"]);
  assert.deepEqual(splitTopLevel("a,(b,c),{d,e}", ","), ["a", "(b,c)", "{d,e}"]);
  assert.deepEqual(splitTopLevel('a,"b,c",d', ","), ["a", '"b,c"', "d"]);
  assert.deepEqual(splitTopLevel("a,'b,c',d", ","), ["a", "'b,c'", "d"]);
  assert.deepEqual(splitTopLevel("a,\x60b,c\x60,d", ","), ["a", "\x60b,c\x60", "d"]);
  assert.deepEqual(splitTopLevel('a,"b\\"c",d', ","), ["a", '"b\\"c"', "d"]);
  assert.deepEqual(splitTopLevel("one", ","), ["one"]);
  assert.deepEqual(splitTopLevel("", ","), [""]);
});
