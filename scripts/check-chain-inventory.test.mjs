// Inventory regression: every committed Node test file must be covered by
// the canonical `npm run check` chain (package.json "scripts.check").
//
// The bug class this guards: a committed hermetic `node --test` suite that
// is silently absent from the protected CI check. The PR workflow only runs
// `npm run check`, and main-branch protection only requires that one
// "check" context, so a test file that is committed but not wired into the
// chain can fail (or rot) with a green merge gate.
//
// The property is fail-closed and explicit:
//   1. Every committed `*.test.mjs` / `*.test.js` file must either be
//      invoked by a `node --test <file>` script that the check chain runs,
//      or be listed in TEST_FILES_EXEMPT_FROM_CHECK with a justification.
//   2. Every `node --test` file referenced by the check chain must actually
//      be a committed file (no dangling references to deleted or uncommitted
//      tests).
//
// Only coverage via an explicit `node --test <file>` invocation inside the
// chain counts; a bare `node --test` discovery script does not count, so the
// inventory stays explicit and reviewable.
//
// TEST_FILES_EXEMPT_FROM_CHECK exists only for genuinely live/manual test
// suites that cannot run inside the protected CI check. It is intentionally
// EMPTY: the current repo has no such committed test file. Adding an entry
// here requires a named justification in this comment block; this exemption
// must never be used to bless an omission that a hermetic suite could close.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TEST_FILES_EXEMPT_FROM_CHECK = new Map(
  // Example of a justified entry (do not add entries without one):
  // [
  //   ["scripts/manual-e2e.test.mjs", "requires a live deployed staging site and is run manually"]
  // ]
);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function committedTestFiles() {
  const files = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
  return files
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && /\.test\.(mjs|js)$/.test(line));
}

function chainCoveredTestFiles(packageJson) {
  const checkChain = packageJson.scripts?.check;
  assert.equal(typeof checkChain, "string", "package.json scripts.check must be a string");

  // The chain invokes suites as `npm run test:<name>`; resolve each name to
  // its script and extract the explicit `node --test <file>` target.
  const chainNames = [...checkChain.matchAll(/npm run (test:[A-Za-z0-9_.-]+)/g)].map(
    (match) => match[1]
  );
  const covered = new Set();
  for (const name of chainNames) {
    const script = packageJson.scripts?.[name];
    assert.equal(
      typeof script,
      "string",
      `check chain references npm run ${name}, but package.json defines no "${name}" script`
    );
    const tokens = script.trim().split(/\s+/);
    const testFlagIndex = tokens.indexOf("--test");
    if (tokens[0] === "node" && testFlagIndex >= 0 && tokens[testFlagIndex + 1]) {
      const file = tokens[testFlagIndex + 1];
      assert.ok(
        !file.startsWith("-"),
        `check chain script "${name}" uses bare node --test discovery; inventory coverage must name files explicitly`
      );
      covered.add(file);
    }
  }
  return covered;
}

test("every committed Node test file is covered by the canonical check chain", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
  );
  const covered = chainCoveredTestFiles(packageJson);
  const committed = committedTestFiles();

  for (const file of committed) {
    assert.ok(
      covered.has(file) || TEST_FILES_EXEMPT_FROM_CHECK.has(file),
      `committed Node test ${file} is absent from the canonical check chain: ` +
        `add a "test:<name>": "node --test ${file}" script and run it from ` +
        `"scripts.check", or justify a TEST_FILES_EXEMPT_FROM_CHECK entry ` +
        `(never for a hermetic suite that CI could run)`
    );
  }
});

test("the check chain only references committed node --test files", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
  );
  const committed = new Set(committedTestFiles());

  for (const [name, script] of Object.entries(packageJson.scripts ?? {})) {
    if (!name.startsWith("test:")) {
      continue;
    }
    // The guard's own script is committed in the same commit that wires it
    // into the chain, so it can never be tracked before the chain references
    // it; skip the self-reference (it is still subject to the first test's
    // coverage property once committed).
    if (name === "test:check-inventory") {
      continue;
    }
    const tokens = script.trim().split(/\s+/);
    const testFlagIndex = tokens.indexOf("--test");
    if (tokens[0] !== "node" || testFlagIndex < 0 || !tokens[testFlagIndex + 1]) {
      continue;
    }
    const file = tokens[testFlagIndex + 1];
    assert.ok(
      committed.has(file),
      `check chain script "${name}" references ${file}, which is not a committed test file`
    );
  }
});
