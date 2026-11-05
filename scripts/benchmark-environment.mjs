#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const benchmarkRoot = path.resolve(process.argv[2] || ".");
const appPath = path.join(benchmarkRoot, "webdriver-ts-results", "src", "App.tsx");
const webdriverPackagePath = path.join(benchmarkRoot, "webdriver-ts", "package.json");

if (!fs.existsSync(appPath)) {
  throw new Error("Benchmark results app not found: " + appPath);
}
if (!fs.existsSync(webdriverPackagePath)) {
  throw new Error("Benchmark webdriver package not found: " + webdriverPackagePath);
}

const benchmarkRequire = createRequire(webdriverPackagePath);
const playwright = benchmarkRequire("playwright");
const browserPath = process.env.CHROME_BINARY || playwright.chromium.executablePath();
const browserOutput = execFileSync(browserPath, ["--version"], { encoding: "utf8" }).trim();
const browserVersion = browserOutput.replace(/^(?:Chromium|Chrome)\s+/i, "");
const browserLabel = process.env.BENCHMARK_BROWSER_NAME || "Chromium";
const driver = process.env.BENCHMARK_DRIVER || "Playwright";

const cpuList = os.cpus();
const cpuModel = cpuList[0] && cpuList[0].model ? cpuList[0].model.trim() : "Unknown CPU";
const logicalCpuCount = cpuList.length || (os.availableParallelism ? os.availableParallelism() : "Unknown");
const memoryGiB = (os.totalmem() / 1024 ** 3).toFixed(1);
const hardware = cpuModel + " · " + logicalCpuCount + " logical CPUs · " + memoryGiB + " GiB RAM";

const osReleaseFile = "/etc/os-release";
let operatingSystem = os.type() + " " + os.release();
if (fs.existsSync(osReleaseFile)) {
  const release = fs.readFileSync(osReleaseFile, "utf8");
  const prettyName = release.match(/^PRETTY_NAME=(?:"([^"]+)"|'([^']+)'|(.+))$/m);
  if (prettyName) operatingSystem = (prettyName[1] || prettyName[2] || prettyName[3]).trim();
}
const releaseText = fs.existsSync("/proc/version") ? fs.readFileSync("/proc/version", "utf8") : "";
const isWsl = Boolean(process.env.WSL_DISTRO_NAME) || /microsoft/i.test(os.release()) || /microsoft/i.test(releaseText);
if (isWsl) operatingSystem += " (WSL2)";

const architecture = os.arch();
const versionLabel = browserLabel + " " + browserVersion;
let app = fs.readFileSync(appPath, "utf8");

function replaceExactlyOnce(source, pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) {
    throw new Error("Expected exactly one " + label + " in " + appPath + "; found " + (matches ? matches.length : 0));
  }
  return source.replace(pattern, replacement);
}

app = replaceExactlyOnce(
  app,
  /const version = "[^"]*";/,
  "const version = " + JSON.stringify(versionLabel) + ";\\n  const architecture = " + JSON.stringify(architecture) + ";",
  "browser version declaration",
);
app = replaceExactlyOnce(
  app,
  /<dt>Browser<\/dt>\s*<dd>\{version\} \(arm64\)<\/dd>/,
  "<dt>Browser</dt>\\n                  <dd>{version} ({architecture})</dd>",
  "browser metadata",
);
app = replaceExactlyOnce(
  app,
  /(<dt>Hardware<\/dt>\s*<dd>)[^<]*(<\/dd>)/,
  function (_match, prefix, suffix) { return prefix + hardware + suffix; },
  "hardware metadata",
);
app = replaceExactlyOnce(
  app,
  /(<dt>Operating system<\/dt>\s*<dd>)[^<]*(<\/dd>)/,
  function (_match, prefix, suffix) { return prefix + operatingSystem + suffix; },
  "operating-system metadata",
);
app = replaceExactlyOnce(
  app,
  /<p>Measured with the [^<]*benchmark driver[^<]*<\/p>/,
  "<p>Measured with the " + driver + " benchmark driver.</p>",
  "benchmark-driver description",
);

fs.writeFileSync(appPath, app);
console.log("Updated benchmark HTML environment metadata:");
console.log("  Browser: " + versionLabel + " (" + architecture + ")");
console.log("  Hardware: " + hardware);
console.log("  OS: " + operatingSystem);
console.log("  Driver: " + driver);
