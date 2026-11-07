import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const helper = `const child_process = require('node:child_process');
child_process.exec('"' + process.execPath + '" -e "process.exit(Number(process.env.MOCK_CLOSURE_EXIT))"', function(err){

        if(err){

            console.error(err);
        }
        else{

            console.log("Build Complete.");
        }
});
`;

function fixture(t, build = helper) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "watervein-jsfb-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const scripts = path.join(dir, "scripts");
  const benchmark = path.join(dir, "js-framework-benchmark");
  const buildPath = path.join(benchmark, "frameworks", "keyed", "mikado", "task", "build.js");
  mkdirSync(scripts, { recursive: true });
  mkdirSync(path.dirname(buildPath), { recursive: true });
  mkdirSync(path.join(benchmark, "scripts"), { recursive: true });
  copyFileSync(path.join(root, "scripts", "setup-jsfb.js"), path.join(scripts, "setup-jsfb.js"));
  const { jsfb } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts;
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module", scripts: { jsfb } }));
  writeFileSync(path.join(benchmark, "frameworks", "keyed", "mikado", "package.json"), "{}\n");
  writeFileSync(buildPath, build);
  writeFileSync(path.join(benchmark, "scripts", "run-watervein.js"), `
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const result = spawnSync(process.execPath, ["js-framework-benchmark/frameworks/keyed/mikado/task/build.js"], { stdio: "inherit" });
if (result.error || result.status !== 0) process.exit(1);
writeFileSync("benchmark-ran", "yes");
`);
  return { dir, buildPath };
}

function run(dir, exitCode) {
  return spawnSync("npm", ["run", "jsfb"], {
    cwd: dir,
    env: { ...process.env, MOCK_CLOSURE_EXIT: String(exitCode) },
    encoding: "utf8",
  });
}

test("Closure failure stops the benchmark and success still runs it", (t) => {
  const { dir, buildPath } = fixture(t);
  const failure = run(dir, 7);
  assert.notEqual(failure.status, 0, failure.stderr);
  assert.throws(() => readFileSync(path.join(dir, "benchmark-ran")));
  const patched = readFileSync(buildPath, "utf8");
  assert.match(patched, /process\.exitCode = 1/);

  const success = run(dir, 0);
  assert.equal(success.status, 0, success.stderr);
  assert.equal(readFileSync(path.join(dir, "benchmark-ran"), "utf8"), "yes");
  assert.equal(readFileSync(buildPath, "utf8"), patched);
});

test("setup rejects an unrecognized helper before the runner starts", (t) => {
  const { dir, buildPath } = fixture(t, "// unknown helper\n");
  const result = run(dir, 0);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Cannot safely update the Mikado build helper/);
  assert.equal(readFileSync(buildPath, "utf8"), "// unknown helper\n");
  assert.throws(() => readFileSync(path.join(dir, "benchmark-ran")));
});

test("setup preserves CRLF line endings", (t) => {
  const { dir, buildPath } = fixture(t, helper.replaceAll("\n", "\r\n"));
  const result = run(dir, 7);
  assert.notEqual(result.status, 0);
  const patched = readFileSync(buildPath, "utf8");
  assert.match(patched, /console\.error\(err\);\r\n {12}process\.exitCode = 1;/);
  assert.doesNotMatch(patched, /(?<!\r)\n/);
});
