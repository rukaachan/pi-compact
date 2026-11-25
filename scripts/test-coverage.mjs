import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const tests = readdirSync("tests")
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => join("tests", name));

const coverage = [
  "--experimental-test-coverage",
  "--test-coverage-include=extensions/**/*.ts",
  "--test-coverage-lines=100",
  "--test-coverage-branches=100",
  "--test-coverage-functions=100",
];

if (process.allowedNodeEnvironmentFlags.has("--test-coverage-include-all")) {
  coverage.splice(2, 0, "--test-coverage-include-all");
}

const result = spawnSync(process.execPath, ["--test", ...coverage, ...tests], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
