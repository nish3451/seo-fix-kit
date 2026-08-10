# Error Log

Use this file only when an approach takes more than two attempts, or when a setup/build/deploy failure is likely to recur.

## Known Failures

### Recurring zero-byte ancestor `package.json` breaks Wrangler dry-runs and canaries

**Status:** recurring host contamination, shielded in-repo since 2026-08-10.

**Symptom:** `npm run cf:dry-run` fails after a green Vite build with
`✘ [ERROR] Unexpected end of file in JSON ../../../package.json:1:0` (wrangler log under
`~/.wrangler/logs/`). The same error class has hit multiple products since 2026-08-02.

**Root cause:** wrangler's esbuild bundle step parses every `package.json` on the
ancestor chain of its working directory, entry points, and own package. A zero-byte
(or otherwise malformed) `package.json` anywhere above the repo kills the build before
bundling starts. An unattributed host tool periodically drops a project-init scaffold
batch (empty `.env*` ×8, `.gitmodules`, `package-lock.json`, `pnpm-lock.yaml`,
`yarn.lock`, `bunfig.toml`, empty `node_modules/`, and zero-byte `package.json`) into
directories it should not touch:
- 2026-08-02: `/home/nish/package.json`
- 2026-08-09 12:40 IST: `/home/nish/workspaces/agent-state/package.json` (batch described
  in `agent-state/lanes/hourly-audit/reports/20260809T082000Z-timers-and-units.md`)
- 2026-08-10 19:21 IST: `/home/nish/package.json` again (batch in `$HOME`, mtime matches
  the `fleet-sol-sweep` lane-control pass start at 19:21:00; creator still unattributed)

**Fix in repo (durable):** `npm run cf:dry-run` now runs through
`scripts/wrangler-dry-run.mjs`. It names every malformed ancestor manifest loudly on
stderr, runs in place when the chain is clean (CI unchanged), and otherwise runs the
dry-run from a shielded scratch copy under the OS temp dir (real copies + hardlinked
`node_modules`, wrangler invoked from its own clean copy) so the canary stays green.
Regression coverage: `npm run test:canary-dry-run`.

**Host-side hygiene (out of repo scope, still needed):** restoring a confirmed empty
scaffold manifest to valid JSON without touching non-empty manifests:
`printf '{}\n' > /home/nish/package.json` (only after `wc -c` confirms size 0).
Watching for new batches: `ls -la /home/nish | grep 'Aug  '`.
