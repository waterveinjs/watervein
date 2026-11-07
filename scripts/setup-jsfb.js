#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WATERVEIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BENCHMARK_DIR = path.join(WATERVEIN_DIR, "js-framework-benchmark");
const CLONE_URL = "https://github.com/waterveinjs/js-framework-benchmark.git";

function runGitClone(destination) {
  const result = spawnSync("git", ["clone", "--depth", "1", CLONE_URL, destination], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("git clone failed with exit code " + result.status);
  }
}

if (existsSync(BENCHMARK_DIR)) {
  console.log("js-framework-benchmark already exists; skipping clone.");
} else {
  const temporaryParent = mkdtempSync(path.join(WATERVEIN_DIR, ".js-framework-benchmark-clone-"));
  const temporaryClone = path.join(temporaryParent, "js-framework-benchmark");

  try {
    console.log("Cloning waterveinjs/js-framework-benchmark...");
    runGitClone(temporaryClone);
    renameSync(temporaryClone, BENCHMARK_DIR);
    console.log("Cloned js-framework-benchmark into " + BENCHMARK_DIR);
  } finally {
    rmSync(temporaryParent, { recursive: true, force: true });
  }
}

if (!existsSync(path.join(BENCHMARK_DIR, "scripts", "run-watervein.js"))) {
  throw new Error(
    BENCHMARK_DIR +
      " exists but does not contain the Watervein benchmark runner. " +
      "Remove or repair that directory, then run pnpm jsfb again.",
  );
}

// The benchmark runner relies on each build exiting nonzero on failure.
// Mikado's helper currently logs Closure errors without setting an exit status.
const mikadoBuildPath = path.join(BENCHMARK_DIR, "frameworks", "keyed", "mikado", "task", "build.js");
const originalErrorHandler = /^ {8}if\(err\)\{\r?\n\r?\n {12}console\.error\(err\);\r?\n {8}\}/gm;
const fixedErrorHandler = /^ {8}if\(err\)\{\r?\n\r?\n {12}console\.error\(err\);\r?\n {12}process\.exitCode = 1;\r?\n {8}\}/m;
const mikadoBuild = readFileSync(mikadoBuildPath, "utf8");
const matches = [...mikadoBuild.matchAll(originalErrorHandler)];
if (matches.length > 0) {
  if (matches.length !== 1) {
    throw new Error("Cannot safely update the Mikado build helper at " + mikadoBuildPath + "; multiple error handlers matched.");
  }
  const newline = matches[0][0].includes("\r\n") ? "\r\n" : "\n";
  const fixed = matches[0][0].replace("console.error(err);", "console.error(err);" + newline + "            process.exitCode = 1;");
  writeFileSync(mikadoBuildPath, mikadoBuild.replace(originalErrorHandler, () => fixed));
} else if (!fixedErrorHandler.test(mikadoBuild)) {
  throw new Error("Cannot safely update the Mikado build helper at " + mikadoBuildPath + "; check its Closure error handling.");
}
