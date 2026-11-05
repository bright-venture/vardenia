# Permanence-layer backup

This folder holds one file, `qr-permanence.json`, and one idea: a printed QR code
is minted once and cannot be reissued, because the paper is already out in the
world. Everything else in the database can be rebuilt. A listing comes back from
the designer's sheet; a scan count starts again from the log. The one thing that
cannot be recreated is the map from a printed code to what it opens, because that
code was random and is now on paper.

It was the only backup while Supabase was on the free plan, and it is still the
one that keeps the history of the codes in git. See "The other backups" below.

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

## The other backups

This file covers the codes, every night, in public. Everything else is personal
data and lives elsewhere:

- **Supabase's daily backups.** Production is on the Pro plan (since 4 Nov 2026),
  which backs the database up every night and keeps seven days, under Database,
  Backups in the dashboard. They do not include Storage, and they live in the
  same account as the database.
- **The weekly full backup**, below, for what those leave out.

## Weekly full backup

`backup:weekly` copies production's `payload` schema and both Storage buckets
(listing photos and guests' receipts) to a disk outside Supabase. It is read-only
on both sides. Run it once a week from the repo root:

```bash
pnpm --filter @vardenia/web backup:weekly
```

It reads `.env.prod` and writes to `Desktop\Vardenia\backups\weekly`, next to the
repo and never inside it: it refuses a folder inside the repository, because this
folder is committed and the copy holds guests, bookings and receipts.

```
backups/weekly/
  2026-11-09/                 one folder per run, never changed afterwards
    manifest.json             row counts and checksums, last migration, files
    database/<table>.jsonl    one row per line, as row_to_json wrote it
    database/_schema.json     columns, enums, sequences, migrations applied
    files/media.json          every object each bucket held that day
    files/receipts.json
  files/media/...             one shared copy of the objects, only added to
  files/receipts/...
```

The first run copies every photo (about 800 MB) and takes a few minutes. Later
runs fetch only new objects. Nothing is ever deleted from `files/`, so a photo
removed from Supabase is still here. A run that stops halfway leaves a folder
ending in `.partial` and simply carries on next time.

Options:

- `--limit 500`: fetch at most 500 new files this run, for a slow connection.
- `--skip-files`: the database only.
- `--list-files`: the database, plus the list of objects, without copying them.
- `--out D:/vardenia-backups`: another folder, such as an external disk.
- `--env <file>`: another env file (default `.env.prod`).

Keep the folder private: an external disk or the company drive, not a shared
folder. Keep about three months of run folders and delete older ones by hand;
each is about 30 MB.

### Restoring from it

Not scripted yet: it comes with the restore test. The steps are:

1. On an empty Postgres, run the migrations up to `lastMigration` in the
   manifest, which recreates every table, enum and index.
2. For each `database/<table>.jsonl`, insert every line with
   `INSERT INTO payload."<table>" SELECT * FROM json_populate_record(null::payload."<table>", $1::json)`,
   with foreign key checks deferred (`SET session_replication_role = replica`).
3. Set each sequence to its `last_value` from `_schema.json`.
4. Upload `files/<bucket>/` back to each bucket.

Every table's rows were checked to load back this way on 5 Nov 2026.
