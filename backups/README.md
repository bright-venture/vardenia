# Permanence-layer backup

This folder holds one file, `qr-permanence.json`, and one idea: a printed QR code
is minted once and cannot be reissued, because the paper is already out in the
world. Everything else in the database can be rebuilt. A listing comes back from
the designer's sheet; a scan count starts again from the log. The one thing that
cannot be recreated is the map from a printed code to what it opens, because that
code was random and is now on paper.

The free Supabase plan takes no database backups, so this is the backup for that
one irreplaceable thing.

## What is in the file

Every QR code, with its target expressed **by slug** rather than by database id
(ids change when a database is rebuilt; slugs do not):

- the code itself,
- what it opens (`business`, `article`, `issue`, `category`, `external`, `home`),
- the target's slug, or the stored category / external URL,
- the issue that carries it,
- whether it is active, and its placement.

All of this is public data already printed on paper, which is why it is safe to
commit to a public repo.

## What is deliberately not in it

- **Bookings and customers.** Personal data has no place in a public repo. It
  waits for Supabase's own backups once there is anything worth losing.
- **The scan log and `scan_count`.** Renewal evidence, but rebuildable, and a
  counter that moves every night would bury the real diffs (see below).
- **Photographs.** They live in Supabase Storage, which no database backup
  covers on any plan. Today they are replaceable test images.

## How it runs

`.github/workflows/backup.yml` runs `backup:export` every night. If a code has
stopped resolving to what it claims (a listing deleted, or a slug changed under
it), the export fails and writes nothing. That failure is the point: a printed
code that quietly points nowhere is the one thing this product cannot ship, and
the alarm is worth more than a snapshot that records the breakage as normal.

When the layer has changed, the workflow commits the new file. Git is the backup
history: offsite from Supabase, versioned, and diffable. The diff is half the
value, because a code changing what it points at without someone deciding to is
exactly the kind of thing you want to see in a commit.

### Setup (once)

Add a repository secret **`BACKUP_DATABASE_URL`** with production's connection
string. Read-only use, so the transaction pooler (port 6543) is fine. That is the
only secret the job needs.

## Restoring

`backup:restore` is a dry run until told otherwise. It rebuilds the code rows
from the file, keyed by the code, going straight to SQL because that is the one
legitimate way past the immutability guard on the `code` field.

```bash
# See what it would do. Changes nothing.
pnpm --filter @vardenia/web backup:restore

# Do it, naming the database out loud so it cannot be the wrong one.
pnpm --filter @vardenia/web backup:restore --write --target <user>@<host>/<db>
```

A code points at its listing by slug, so **the listings have to be in place
first**. If a slug in the file matches no listing, that code is skipped and
reported, and `--write` refuses to commit a half-restore. The order for a full
rebuild is:

1. Bring back the businesses, articles and issues (re-import, or restore them
   from their own backup).
2. Run `backup:restore --write`.

### One caveat after a re-import

Re-importing listings mints a fresh code for each one (see
`src/import/run.ts`). The restore then re-creates the **original** codes and
reattaches each business to its original, so scans of the printed codes work and
the dashboard shows the right code. The freshly minted codes are left behind as
unused extra rows. Once you have confirmed the restore, remove them:

```sql
-- The codes NOT in the backup are the ones the re-import minted. Nothing printed
-- points at them. Check the count first, then delete.
select count(*) from payload.qr_codes
where code not in ( /* the codes from qr-permanence.json */ );
```

This is left as a deliberate, eyes-open step rather than something the restore
does on its own, because deleting a QR code row is the one action the whole
system is otherwise built to prevent.

## When to stop relying on this

This covers the pre-launch state, where the only irreplaceable data is the codes.
Once real bookings and customers accrue, upgrade Supabase to a plan with
scheduled backups and point-in-time recovery: that data is personal, cannot live
here, and this file was never meant to hold it.
