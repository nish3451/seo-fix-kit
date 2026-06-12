# Database restore runbook

The production database is D1 `seofixkit_waitlist`
(id `887316c4-ca9d-4068-a7fa-1f530b479437`). Two restore paths exist.
Use Time Travel first — it is faster and has no statement-size limits.

## Path 1 (primary): D1 Time Travel — point-in-time, last 30 days

1. Find the moment to restore to:

   ```bash
   npx wrangler d1 time-travel info seofixkit_waitlist
   # or with a timestamp:
   npx wrangler d1 time-travel info seofixkit_waitlist --timestamp "2026-06-12T00:00:00Z"
   ```

2. Restore (this rewrites the live database in place — the Worker keeps
   serving, rows revert to the bookmark):

   ```bash
   npx wrangler d1 time-travel restore seofixkit_waitlist --bookmark=<bookmark-id>
   ```

3. Verify: `curl https://seofixkit.com/api/health`, then spot-check
   `/beta/admin` counts.

## Path 2 (catastrophic loss): SQL export in R2

Weekly exports live in `r2://seofixkit-backups/d1/seofixkit-backup-YYYY-MM-DD.sql`
(created by `ops/backup-d1.sh`, scheduled weekly).

```bash
npx wrangler r2 object get "seofixkit-backups/d1/seofixkit-backup-YYYY-MM-DD.sql" --file backup.sql --remote
npx wrangler d1 create seofixkit_waitlist        # if the DB itself is gone
npx wrangler d1 execute seofixkit_waitlist --remote --file backup.sql
```

Then update `database_id` in `wrangler.jsonc` if a new DB was created, and
`npx wrangler deploy`.

### Known limitation (rehearsed 2026-06-12)

A restore rehearsal into a scratch database failed on oversized
`audit_reports.report_json` rows with `SQLITE_TOOBIG`: rows over the D1
per-statement limit cannot be re-imported from a SQL dump. Until report
blobs move to R2 (planned), a dump restore would need those INSERT
statements stripped (losing those report bodies but keeping everything
else):

```bash
# keep schema + all rows except the oversized report inserts
awk 'length($0) < 90000' backup.sql > backup-trimmed.sql
```

Time Travel does NOT have this limitation — which is why it is Path 1.
Re-rehearse a full dump restore after the report-blob R2 migration ships.

## Rehearsal log

- 2026-06-12 — bucket created, first export uploaded, scratch-DB restore
  attempted: schema/small tables import; oversized report rows hit
  SQLITE_TOOBIG (see limitation above). Scratch DB deleted.
