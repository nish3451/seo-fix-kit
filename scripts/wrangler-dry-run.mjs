#!/usr/bin/env node
// Shielded Wrangler dry-run guard for `npm run cf:dry-run`.
//
// WHY THIS FILE EXISTS
// --------------------
// Wrangler's esbuild bundle step parses every package.json file on the
// ancestor chain of its working directory, its entry points, and its own
// installed package. A malformed manifest anywhere above the repo — most
// commonly the recurring zero-byte scaffold `package.json` that some host
// tooling periodically drops into /home/nish (also seen at
// agent-state/package.json on 2026-08-09 and /home/nish/package.json on
// 2026-08-02 and 2026-08-10) — makes `wrangler deploy --dry-run` fail with
// "Unexpected end of file in JSON" before bundling even starts. The
// deployment canary then goes red even though the Worker itself is fine,
// and real product regressions get hidden behind a shared-filesystem
// artifact.
//
// WHAT THIS GUARD DOES
// --------------------
// 1. Walks the ancestor chain from the repo root to "/" and names every
//    malformed package.json manifest loudly on stderr (absolute path +
//    reason), so the contamination is visible instead of a cryptic
//    `../../../package.json:1:0` esbuild error.
// 2. When the chain is clean it runs `wrangler deploy --dry-run` in place
//    exactly as before — zero behavioral change on healthy hosts (CI).
// 3. When a malformed ancestor manifest is found it runs the dry-run from a
//    scratch copy of the deploy surface under the OS temp dir, whose
//    ancestor chain cannot be poisoned. The scratch uses REAL file copies —
//    symlinks leak the real path back into the poisoned chain — plus a
//    hardlink copy of node_modules so the wrangler binary itself (which
//    anchors esbuild's working directory at its own package location) also
//    runs from the clean chain.
//
// The guard never writes to or repairs files outside the repo; it only
// isolates the canary. Restoring a confirmed empty scaffold manifest to
// valid JSON stays a separate host-side hygiene action.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Directories that make up the deploy surface. `worker` and `shared` are
// the Worker module graph, `dist` is the assets directory, `migrations` is
// the D1 migrations dir referenced by wrangler.jsonc. Each is copied when
// present; missing entries are skipped (fixture/test setups may not have
// them all).
const DEPLOY_DIRS = ["worker", "shared", "dist", "migrations"];
const DEPLOY_FILES = ["package.json", "package-lock.json", "wrangler.jsonc"];

/**
 * Walk from `fromDir` up to the filesystem root and return every
 * package.json manifest that does not parse as JSON, with its absolute
 * path and the parse problem. These are exactly the files esbuild parses
 * when wrangler bundles, so this detection is a faithful stand-in for
 * "will the in-place dry-run survive".
 */
export function malformedAncestorManifests(fromDir) {
  const findings = [];
  let dir = path.resolve(fromDir);
  for (;;) {
    const manifest = path.join(dir, "package.json");
    let content;
    try {
      content = fs.readFileSync(manifest, "utf8");
    } catch {
      // No manifest at this level (or unreadable — treat as absent).
    }
    if (content !== undefined) {
      try {
        JSON.parse(content);
      } catch (err) {
        findings.push({
          path: manifest,
          problem: `not valid JSON (${err.message})`
        });
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return findings;
}

/**
 * True when `dir` has no package.json on its own chain (itself included).
 * The scratch root must be in a chain with no manifests at all, so no
 * malformed file can ever be reached from it.
 */
function chainIsFreeOfManifests(dir) {
  let current = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(current, "package.json"))) return false;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return true;
}

/**
 * Pick a scratch root whose ancestor chain contains no package.json at
 * all. Tries an explicit override, then the OS temp dir, then /tmp.
 * Throws with a loud message when no clean root exists.
 */
export function pickCleanScratchRoot() {
  const candidates = [];
  if (process.env.SEOFIXKIT_WRANGLER_SCRATCH_TMPDIR) {
    candidates.push(process.env.SEOFIXKIT_WRANGLER_SCRATCH_TMPDIR);
  }
  candidates.push(os.tmpdir());
  if (os.tmpdir() !== "/tmp") candidates.push("/tmp");
  for (const base of candidates) {
    let scratch;
    try {
      fs.mkdirSync(base, { recursive: true });
      scratch = fs.mkdtempSync(path.join(base, "seofixkit-wrangler-dry-run-"));
    } catch {
      continue;
    }
    if (chainIsFreeOfManifests(scratch)) return scratch;
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  throw new Error(
    "wrangler-dry-run: no clean scratch root available. Tried: " +
      candidates.join(", ") +
      ". Every candidate either cannot be created or has a package.json on its " +
      "ancestor chain, so the dry-run cannot be shielded from malformed " +
      "ancestor manifests. Refusing to run in place."
  );
}

/**
 * Resolve the wrangler CLI entry inside `projectRoot/node_modules`,
 * following the package.json "bin" field so future wrangler versions that
 * relocate the entry keep working. Returns null when wrangler is not
 * installed in this project.
 */
export function resolveWranglerBin(projectRoot) {
  const wranglerPackage = path.join(projectRoot, "node_modules", "wrangler");
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(wranglerPackage, "package.json"), "utf8")
    );
    const bin = pkg.bin?.wrangler || "bin/wrangler.js";
    const resolved = path.join(wranglerPackage, bin);
    return fs.existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

/**
 * Build the shielded deploy surface for `projectRoot`:
 *  - real copies of the small deploy files and dirs (symlinks would let
 *    esbuild resolve the real path back into the poisoned chain),
 *  - node_modules hardlink-copied with `cp -al` (instant on the same
 *    filesystem; falls back to a real copy on cross-device temp dirs),
 *  - returns `{ scratch }` where scratch is under a manifest-free chain.
 */
export function buildShieldedScratch(projectRoot) {
  const scratch = pickCleanScratchRoot();
  try {
    for (const file of DEPLOY_FILES) {
      const src = path.join(projectRoot, file);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(scratch, file));
    }
    for (const dir of DEPLOY_DIRS) {
      const src = path.join(projectRoot, dir);
      if (fs.existsSync(src)) {
        fs.cpSync(src, path.join(scratch, dir), {
          recursive: true,
          dereference: true
        });
      }
    }
    const nodeModulesSrc = path.join(projectRoot, "node_modules");
    const nodeModulesDest = path.join(scratch, "node_modules");
    if (!fs.existsSync(nodeModulesSrc)) {
      throw new Error(
        `wrangler-dry-run: ${nodeModulesSrc} does not exist; run npm ci first`
      );
    }
    const hardlink = spawnSync("cp", ["-al", nodeModulesSrc, nodeModulesDest], {
      encoding: "utf8"
    });
    if (hardlink.status !== 0) {
      // Cross-device temp dir (e.g. CI tmpfs): hardlinks are impossible.
      // Fall back to a real copy — slower but still correct. A failed `cp
      // -al` may have left a partial destination behind; if it exists,
      // `cp -r src dest` would nest the copy inside it (dest/src/...) and
      // resolveWranglerBin(scratch) would find no wrangler. Remove the
      // partial target first so the fallback lands at scratch/node_modules.
      fs.rmSync(nodeModulesDest, { recursive: true, force: true });
      const realCopy = spawnSync("cp", ["-r", nodeModulesSrc, nodeModulesDest], {
        encoding: "utf8"
      });
      if (realCopy.status !== 0) {
        throw new Error(
          `wrangler-dry-run: could not copy node_modules into the shielded ` +
            `scratch (hardlink: ${hardlink.stderr?.trim() || "failed"}; copy: ${
              realCopy.stderr?.trim() || "failed"
            })`
        );
      }
    }
    return { scratch };
  } catch (err) {
    fs.rmSync(scratch, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Run `wrangler deploy --dry-run` with the given working directory,
 * inheriting stdio so the canary output looks exactly like a direct
 * wrangler invocation. Returns the exit code.
 *
 * `envOverride` is for tests that need to inject environment for a fake
 * wrangler; callers outside tests omit it.
 */
export function runWranglerDryRun(cwd, wranglerBin, envOverride) {
  const result = spawnSync(process.execPath, [wranglerBin, "deploy", "--dry-run"], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...(envOverride || {}) }
  });
  return result.status === null ? 1 : result.status;
}

/**
 * The full guard: name malformed ancestors, then run the dry-run either in
 * place (clean chain) or from a shielded scratch (contaminated chain).
 * Returns the dry-run exit code. `envOverride` is for tests.
 */
export function runGuardedDryRun(projectRoot, envOverride) {
  const malformed = malformedAncestorManifests(projectRoot);
  for (const finding of malformed) {
    console.error(
      `[wrangler-dry-run] malformed ancestor package.json at ${finding.path} ` +
        `(${finding.problem}). The dry-run will run from a shielded scratch ` +
        `copy so the canary stays green; restoring a confirmed empty scaffold ` +
        `manifest to valid JSON ({}) is a separate host-side hygiene action.`
    );
  }
  const wranglerBin = resolveWranglerBin(projectRoot);
  if (!wranglerBin) {
    throw new Error(
      "wrangler-dry-run: wrangler is not installed in this project (node_modules/wrangler missing); run npm ci first"
    );
  }
  if (malformed.length === 0) {
    // Healthy host: behave exactly like `wrangler deploy --dry-run`.
    return runWranglerDryRun(projectRoot, wranglerBin, envOverride);
  }
  const { scratch } = buildShieldedScratch(projectRoot);
  try {
    // The wrangler binary must be invoked from inside the scratch: wrangler
    // anchors its esbuild working directory at its own package location, so
    // running the worktree copy would drag the poisoned chain back in.
    const scratchBin = resolveWranglerBin(scratch);
    if (!scratchBin) {
      throw new Error("wrangler-dry-run: shielded scratch lost its wrangler copy");
    }
    return runWranglerDryRun(scratch, scratchBin, envOverride);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = runGuardedDryRun(REPO_ROOT);
  } catch (err) {
    console.error(`[wrangler-dry-run] ${err.message}`);
    process.exitCode = 1;
  }
}
