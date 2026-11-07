#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import os from "node:os";
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
  const temporaryParent = mkdtempSync(path.join(os.tmpdir(), "watervein-jsfb-"));
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
