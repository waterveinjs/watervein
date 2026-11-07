#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = process.cwd();
const OWNER_REPO = "waterveinjs/watervein";
const PAGES_REPO = "waterveinjs/benchmark";
const REPORT_DIR = path.join(ROOT, "js-framework-benchmark", "webdriver-ts-results", "dist");
const REPORT_HTML = path.join(REPORT_DIR, "index.html");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(command + " " + args.join(" ") + " failed with exit code " + result.status);
  }
  return result;
}

function output(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(command + " " + args.join(" ") + " failed: " + result.stderr.trim());
  }
  return result.stdout.trim();
}

function assertCleanAndSynced() {
  if (output("git", ["status", "--porcelain"]).length > 0) {
    throw new Error("The working tree must be clean before releasing. Commit or stash all changes first.");
  }

  const upstream = output("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  const [behind, ahead] = output("git", ["rev-list", "--left-right", "--count", upstream + "...HEAD"])
    .split(/\s+/)
    .map(Number);
  if (behind !== 0 || ahead !== 0) {
    throw new Error("The current branch must be fully synchronized with " + upstream + ".");
  }

  const remote = output("git", ["remote", "get-url", "origin"]);
  if (!/github\.com[:/]waterveinjs\/watervein(?:\.git)?$/i.test(remote)) {
    throw new Error("origin must point to https://github.com/waterveinjs/watervein.");
  }
}

function getReleaseVersion() {
  const packageNames = ["core", "dom-core", "dom"];
  const versions = packageNames.map((name) => {
    const file = path.join(ROOT, "packages", name, "package.json");
    if (!existsSync(file)) throw new Error("Missing package manifest: " + file);
    return JSON.parse(readFileSync(file, "utf8")).version;
  });
  if (!versions[0] || versions.some((version) => version !== versions[0])) {
    throw new Error("The core, dom-core, and dom package versions must all match.");
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(versions[0])) {
    throw new Error("Invalid release version: " + versions[0]);
  }
  return versions[0];
}

function assertTagDoesNotExist(tag) {
  if (output("git", ["tag", "--list", tag]).length > 0) {
    throw new Error("Tag already exists locally: " + tag);
  }
  const remoteTags = output("git", ["ls-remote", "--tags", "origin", "refs/tags/" + tag]);
  if (remoteTags.length > 0) throw new Error("Tag already exists on origin: " + tag);
}

function assertReportExists() {
  if (!existsSync(REPORT_HTML) || !statSync(REPORT_HTML).isFile() || statSync(REPORT_HTML).size < 1024) {
    throw new Error("The benchmark HTML report is missing or unexpectedly small: " + REPORT_HTML);
  }
  const html = readFileSync(REPORT_HTML, "utf8");
  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) {
    throw new Error("The generated benchmark report does not look like a complete HTML document.");
  }
  if (!existsSync(path.join(REPORT_DIR, "overview.html"))) {
    throw new Error("The generated benchmark overview page is missing.");
  }
}

async function waitForRelease(tag) {
  console.log("Waiting for the tag-triggered GitHub Release...");
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = spawnSync("gh", ["release", "view", tag, "--repo", OWNER_REPO, "--json", "url"], {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status === 0) {
      const release = JSON.parse(result.stdout);
      console.log("GitHub Release is ready: " + release.url);
      return;
    }
    await delay(5000);
  }
  throw new Error("GitHub Release was not created within five minutes. Check the tag-triggered Release workflow.");
}

async function main() {
  if (!existsSync(path.join(ROOT, "package.json")) ||
      JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).name !== "@watervein/monorepo") {
    throw new Error("Run pnpm release from the root of waterveinjs/watervein.");
  }

  run("gh", ["auth", "status"]);
  assertCleanAndSynced();

  const version = getReleaseVersion();
  const tag = "v" + version;
  assertTagDoesNotExist(tag);

  console.log("\nRunning the release build and test suite...");
  run("pnpm", ["build"]);
  run("pnpm", ["test"]);

  console.log("\nRunning the benchmark on this machine...");
  run("pnpm", ["jsfb"]);
  assertReportExists();

  const commit = output("git", ["rev-parse", "HEAD"]);
  console.log("\nBenchmark report validated for " + tag + " at commit " + commit + ".");
  const archive = path.join(ROOT, "watervein-benchmark-" + tag + ".tar.gz");
  try {
    run("tar", ["-czf", archive, "-C", REPORT_DIR, "."]);
    console.log("Creating and pushing the release tag...");
    run("git", ["tag", "-a", tag, "-m", "Release " + tag]);
    run("git", ["push", "origin", tag]);

    await waitForRelease(tag);
    run("gh", ["release", "upload", tag, archive, "--repo", OWNER_REPO, "--clobber"]);

    console.log("\nDispatching the GitHub Pages deployment...");
    run("gh", [
      "workflow",
      "run",
      "publish.yml",
      "--repo",
      PAGES_REPO,
      "--ref",
      "main",
      "--field",
      "tag=" + tag,
    ]);
  } finally {
    if (existsSync(archive)) unlinkSync(archive);
  }

  console.log("\nRelease " + tag + " has been tagged, its local benchmark report archive uploaded, and Pages deployment queued.");
  console.log("The report will be published under https://waterveinjs.github.io/benchmark/versions/" + tag + "/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
