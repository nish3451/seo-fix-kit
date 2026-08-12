// Regression tests for the shielded Wrangler dry-run guard
// (scripts/wrangler-dry-run.mjs).
//
// The bug class: a malformed (typically zero-byte scaffold) package.json on
// the ancestor chain of the repo makes wrangler's esbuild bundle step fail
// with "Unexpected end of file in JSON" before bundling starts, so the
// `cf:dry-run` deployment canary goes red even though the Worker is fine.
// These tests pin both halves of the fix:
//   1. detection loudly names malformed ancestor manifests, and
//   2. the shielded scratch copy isolates the dry-run from any malformed
//      ancestor, using the REAL esbuild binary against a REAL zero-byte
//      manifest — if the shield ever stops isolating the entry/cwd from
//      poisoned ancestors, the bundle test fails.
// The last test runs the actual guard against the real repo with the real
// wrangler, which is the canary itself.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildShieldedScratch,
  malformedAncestorManifests,
  pickCleanScratchRoot,
  resolveWranglerBin,
  runGuardedDryRun,
  runWranglerDryRun
} from "./wrangler-dry-run.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const ESBUILD_BIN = path.join(REPO_ROOT, "node_modules", "esbuild", "bin", "esbuild");
const WRAPPER = path.join(SCRIPT_DIR, "wrangler-dry-run.mjs");

// A fake wrangler CLI that records its working directory and exits 0, so
// the shield mechanics can be tested without touching the real wrangler.
const FAKE_WRANGLER_SOURCE = `const fs = require("node:fs");
fs.writeFileSync(process.env.FIXTURE_CWD_OUT || "/tmp/fixture-cwd-out", process.cwd());
`;

function makeFixture({ poisoned }) {
  // Fixtures must live under a verified clean chain: if os.tmpdir() itself
  // had a package.json on its ancestor chain, the fixture base would be in
  // a poisoned chain and the "clean" control assertions would fail for the
  // wrong reason. pickCleanScratchRoot() guarantees a manifest-free chain.
  const base = pickCleanScratchRoot();
  const projectRoot = path.join(
    base,
    poisoned ? "poisoned-parent" : "clean-parent",
    "project"
  );
  if (poisoned) {
    fs.mkdirSync(path.dirname(projectRoot), { recursive: true });
    fs.writeFileSync(path.join(path.dirname(projectRoot), "package.json"), "");
  }
  fs.mkdirSync(path.join(projectRoot, "worker"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "fixture", type: "module", private: true })
  );
  fs.writeFileSync(
    path.join(projectRoot, "wrangler.jsonc"),
    JSON.stringify({ name: "fixture", main: "worker/index.js" })
  );
  fs.writeFileSync(
    path.join(projectRoot, "worker", "index.js"),
    "export const fixture = true;\n"
  );
  const wranglerDir = path.join(projectRoot, "node_modules", "wrangler");
  fs.mkdirSync(path.join(wranglerDir, "bin"), { recursive: true });
  fs.writeFileSync(
    path.join(wranglerDir, "package.json"),
    JSON.stringify({ name: "wrangler", bin: { wrangler: "bin/wrangler.js" } })
  );
  fs.writeFileSync(path.join(wranglerDir, "bin", "wrangler.js"), FAKE_WRANGLER_SOURCE);
  return { base, projectRoot, poisoned };
}

function cleanupFixture(fixture) {
  fs.rmSync(fixture.base, { recursive: true, force: true });
}

function chainHasPackageJson(dir) {
  let current = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(current, "package.json"))) return true;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return false;
}

// Ancestors strictly above `dir` (the scratch root itself legitimately
// holds the project's own valid package.json copy) must be manifest-free.
function ancestorsAreManifestFree(dir) {
  let current = path.resolve(dir);
  for (;;) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
    if (fs.existsSync(path.join(current, "package.json"))) return false;
  }
  return true;
}

function esbuildBundle(cwd) {
  return spawnSync(
    ESBUILD_BIN,
    ["worker/index.js", "--bundle", "--format=esm", "--platform=neutral", "--outfile=bundle-out.js"],
    { cwd, encoding: "utf8" }
  );
}

test("malformedAncestorManifests names a zero-byte ancestor and stays quiet on clean chains", () => {
  const poisoned = makeFixture({ poisoned: true });
  try {
    const findings = malformedAncestorManifests(poisoned.projectRoot);
    const zeroByte = path.join(path.dirname(poisoned.projectRoot), "package.json");
    const named = findings.find((f) => f.path === zeroByte);
    assert.ok(named, `expected ${zeroByte} to be named, got: ${JSON.stringify(findings)}`);
    assert.match(named.problem, /JSON/i);
  } finally {
    cleanupFixture(poisoned);
  }

  const clean = makeFixture({ poisoned: false });
  try {
    assert.deepEqual(malformedAncestorManifests(clean.projectRoot), []);
  } finally {
    cleanupFixture(clean);
  }
});

test("pickCleanScratchRoot returns a directory with no package.json on its chain", () => {
  const scratch = pickCleanScratchRoot();
  try {
    assert.ok(fs.existsSync(scratch));
    assert.ok(!chainHasPackageJson(scratch), `scratch chain must be manifest-free: ${scratch}`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("a real zero-byte ancestor breaks esbuild in place but not from the shielded scratch", () => {
  const fixture = makeFixture({ poisoned: true });
  let scratch;
  try {
    // Control: esbuild in the poisoned location must fail with the exact
    // bug signature.
    const inPlace = esbuildBundle(fixture.projectRoot);
    assert.notEqual(inPlace.status, 0, "esbuild should fail in the poisoned location");
    assert.match(inPlace.stderr, /Unexpected end of file in JSON/);

    // Fix: the shielded scratch must bundle the same entry cleanly.
    scratch = buildShieldedScratch(fixture.projectRoot).scratch;
    assert.ok(
      ancestorsAreManifestFree(scratch),
      `scratch ancestors must be manifest-free: ${scratch}`
    );

    // The scratch must hold real copies, not symlinks (symlinks leak the
    // real path back into the poisoned chain).
    const scratchEntry = path.join(scratch, "worker", "index.js");
    assert.ok(fs.existsSync(scratchEntry));
    assert.ok(!fs.lstatSync(scratchEntry).isSymbolicLink(), "worker entry must be a real copy");

    const fromScratch = esbuildBundle(scratch);
    assert.equal(
      fromScratch.status,
      0,
      `esbuild must succeed from the shielded scratch: ${fromScratch.stderr}`
    );
  } finally {
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
    cleanupFixture(fixture);
  }
});

test("runWranglerDryRun executes the (fake) wrangler with the scratch as cwd", () => {
  const fixture = makeFixture({ poisoned: true });
  let scratch;
  try {
    scratch = buildShieldedScratch(fixture.projectRoot).scratch;
    const out = path.join(scratch, "cwd-out.txt");
    const result = runWranglerDryRun(scratch, resolveWranglerBin(scratch), {
      FIXTURE_CWD_OUT: out
    });
    assert.equal(result, 0);
    assert.equal(fs.readFileSync(out, "utf8"), scratch);
  } finally {
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
    cleanupFixture(fixture);
  }
});

test("runGuardedDryRun shields a poisoned chain and runs in place on a clean one", () => {
  const fixture = makeFixture({ poisoned: true });
  try {
    const out = path.join(fixture.base, "poisoned-cwd-out.txt");
    const stderrLines = [];
    const originalError = console.error;
    console.error = (line) => stderrLines.push(String(line));
    let status;
    try {
      status = runGuardedDryRun(fixture.projectRoot, { FIXTURE_CWD_OUT: out });
    } finally {
      console.error = originalError;
    }
    assert.equal(status, 0);
    // Shielded: the fake wrangler must have run from the scratch, not the
    // poisoned project, and the malformed ancestor must be named loudly.
    const ranFrom = fs.readFileSync(out, "utf8");
    assert.notEqual(ranFrom, fixture.projectRoot);
    assert.ok(
      ancestorsAreManifestFree(ranFrom),
      `shielded run must live under manifest-free ancestors: ${ranFrom}`
    );
    const zeroByte = path.join(path.dirname(fixture.projectRoot), "package.json");
    assert.ok(
      stderrLines.some((l) => l.includes(zeroByte) && l.includes("malformed")),
      `expected a loud stderr naming ${zeroByte}, got: ${stderrLines.join("|")}`
    );
  } finally {
    cleanupFixture(fixture);
  }

  const clean = makeFixture({ poisoned: false });
  try {
    const out = path.join(clean.base, "clean-cwd-out.txt");
    const status = runGuardedDryRun(clean.projectRoot, { FIXTURE_CWD_OUT: out });
    assert.equal(status, 0);
    // In-place: the fake wrangler must have run from the project itself.
    assert.equal(fs.readFileSync(out, "utf8"), clean.projectRoot);
  } finally {
    cleanupFixture(clean);
  }
});

test("the real canary guard exits 0 against the real repo and wrangler", () => {
  // wrangler.jsonc declares ./dist as the assets directory, so a fresh
  // checkout (CI) has no dist/ and wrangler aborts before bundling. The
  // canary script (`npm run cf:dry-run`) builds first; reproduce that here
  // so the test is self-sufficient on a clean checkout. `npm run check`
  // also builds at the end of its chain, so a repo with dist already
  // present (local dev) skips the duplicate build.
  if (!fs.existsSync(path.join(REPO_ROOT, "dist"))) {
    const built = spawnSync("npm", ["run", "build"], {
      cwd: REPO_ROOT,
      encoding: "utf8"
    });
    assert.equal(
      built.status,
      0,
      `vite build must succeed so the real canary can run; stdout: ${built.stdout?.slice(-1000)}\nstderr: ${built.stderr?.slice(-1000)}`
    );
  }
  const result = spawnSync(process.execPath, [WRAPPER], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, CI: "1", NO_COLOR: "1" }
  });
  assert.equal(
    result.status,
    0,
    `guard must exit 0; stdout: ${result.stdout?.slice(-2000)}\nstderr: ${result.stderr?.slice(-2000)}`
  );
  assert.match(
    result.stdout + result.stderr,
    /--dry-run: exiting now\./,
    "wrangler must complete the dry-run successfully"
  );
  // When this host is contaminated, the guard must have named the offender.
  const malformed = malformedAncestorManifests(REPO_ROOT);
  for (const finding of malformed) {
    assert.ok(
      result.stderr.includes(finding.path),
      `guard must name ${finding.path} loudly on a contaminated host`
    );
  }
});

test("resolveWranglerBin finds the repo wrangler entry", () => {
  const bin = resolveWranglerBin(REPO_ROOT);
  assert.ok(bin, "wrangler bin must resolve in the repo");
  assert.ok(fs.existsSync(bin));
});
