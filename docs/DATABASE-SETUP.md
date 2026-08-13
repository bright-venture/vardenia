# Setting up the database

Vardenia uses **Supabase** - hosted PostgreSQL. There is nothing to install: no Docker, no
local Postgres. You create a project in a browser, paste one line into `.env`, and the app
runs.

Budget ten minutes. You only do this once.

---

## One project now, two later

Right now you need **one** Supabase project, for development. When you deploy something the
public can reach, create a **second** for production and never point your laptop at it.

That separation is not bureaucracy. In development the app is allowed to alter the database
shape automatically as you edit the code; against production that would rewrite live
advertiser data without asking.

---

## 1. Create the project

Sign up at [supabase.com](https://supabase.com) - the free tier is enough and needs no card.
Create a project:

- **Name** - `vardenia-dev`
- **Region** - **Frankfurt (eu-central-1)**. Closest to Lebanon and the Gulf. Region cannot
  be changed later without recreating the project, so get it right now.
- **Password** - generate a strong one and save it in a password manager immediately.
  Supabase shows it once.

Wait a minute or two for it to finish provisioning.

## 2. Enable the map extension

Vardenia needs PostGIS for "restaurants near me". Open **SQL Editor**, paste this, and run it:

```sql
create extension if not exists postgis;
```

## 3. Create the schema the app lives in

```sql
create schema if not exists payload;
```

Everything Vardenia stores goes here rather than in `public` - see step 5 for why that
matters.

## 4. Get the connection string

Click **Connect** in the top bar of the dashboard, then the **Direct / Connection string**
tab, then select **Transaction pooler** as the connection method. The host contains
`pooler` and the port is `6543`.

Do not use the "Direct connection" option. Those are IPv6-only unless you buy Supabase's
IPv4 add-on, and most home and office networks are IPv4-only, so it will simply fail to
connect.

Copy `.env.example` to `.env` if you haven't, and set:

```
DATABASE_URL=postgresql://postgres.<ref>:<your-password>@<region>.pooler.supabase.com:6543/postgres
```

Replace `<your-password>` with the password from step 1.

> `.env` is deliberately excluded from Git - it holds your password. Never commit it, never
> paste it into a chat or an issue.

## 5. Close the public data API

**This is the step that protects your commercial data.**

Supabase automatically publishes a REST API over the `public` schema, reachable from any
browser with the anon key - and that key is public by design. Your listings carry contract
values, tier, sales owner and internal notes. None of that may ever be readable that way.

Two layers:

- **Settings -> API -> Exposed schemas** - confirm `payload` is **not** listed.
- **Settings -> API -> Data API** - turn it off. Vardenia reaches the database through the
  app, never through this API.

Step 3 already put your tables outside `public`, so this is a second lock rather than the
only one. Both, please.

## 6. Start it

```bash
pnpm --filter @vardenia/web seed
```

```bash
pnpm dev
```

The app creates its ~46 tables on first run. Then open http://localhost:3000/admin and sign
in with `admin@vardenia.local` / `ChangeMe123!`.

---

## Things that will confuse you later

**Free projects pause after about a week of inactivity.** If the app suddenly can't connect
after a quiet fortnight, open the Supabase dashboard and resume the project. Nothing is lost.

**Three connection strings, and they are not interchangeable.**

- **Transaction pooler**, port `6543`. Running the app. This is your normal `DATABASE_URL`.
- **Session pooler**, port `5432`. Migrations only, because a schema change needs to hold a
  session open and the transaction pooler will not do that.
- **Direct connection**, port `5432`, host `db.<ref>.supabase.co`. Avoid. IPv6-only unless
  you pay for the IPv4 add-on.

Using the transaction pooler for a migration fails with an error that does not explain
itself, so check this first if a migration behaves strangely.

**Your data lives in the `payload` schema, not `public`.** If you browse tables in the
Supabase dashboard and the list looks empty, switch the schema dropdown at the top from
`public` to `payload`.

**Three objects in `public` are normal.** PostGIS installs `spatial_ref_sys` plus two views,
`geometry_columns` and `geography_columns`. They are a reference list of map coordinate
systems, not Vardenia data. Nothing of ours should ever appear alongside them.

**The first page load after starting is slow, then it is fine.** Next.js compiles each route
on first request. The admin panel is the worst of them at roughly 30 seconds. Subsequent
loads are normal.

**Continuous integration does not use Supabase.** The automated checks on GitHub spin up
their own throwaway database, so a failing build can never be caused by - or damage - your
real one.

---

## Schema changes

Two different mechanisms, on purpose.

**In development, Payload pushes.** `push` is on whenever `NODE_ENV` is not `production`, so
adding a field to a collection and restarting is enough - Payload compares the collections to
the database and alters it to match. Fast, and fine to lose.

**In production, migrations run.** `push` is off there, because letting a process silently
alter a live database is how a column disappears at 2am. Production applies ordered migration
files instead, each recorded in `payload_migrations` so it runs exactly once.

### Adding a migration

```bash
pnpm --filter @vardenia/web migrate:create <name>   # writes a .ts and a .json snapshot
pnpm --filter @vardenia/web migrate:status          # what has run
pnpm --filter @vardenia/web migrate                 # apply pending ones
```

`migrate:create` diffs your collections against the previous snapshot in
`apps/web/src/migrations`. It never reads the live database, so generating one is safe.

Use the **session pooler** connection string when running `migrate` (see above).

### The baseline

`20260813_123246_baseline.ts` is the whole schema as it stood when migrations were adopted:
41 tables, 40 enum types, 71 foreign keys. Everything before it was built by dev `push` and
exists in no migration file, which is why the baseline had to be captured by hand.

It is already recorded as applied against the Supabase database, so `migrate` skips it there.
A brand new database runs it and gets a complete schema.

Two things about it are worth knowing:

- **It starts with `CREATE SCHEMA IF NOT EXISTS "payload"`, added manually.** Payload only
  issues that statement when it creates an entire database, which it cannot do on Supabase.
  Without the line, the first `CREATE TABLE` on a fresh database fails with "schema payload
  does not exist". **If this file is ever regenerated, put the line back.**
- **Regenerating it is almost never right.** It describes a point in history. New changes go
  in new migrations.

### The `dev` row

`payload_migrations` contains a row named `dev` with `batch = -1`. Payload writes it whenever
push alters the database, to record that this database was built by pushing rather than by
migrating.

Its effect: `payload migrate` on this database first asks "you've run in dev mode, data loss
may occur, proceed?". In a non-interactive shell that prompt cannot be answered, so the
command **exits successfully having done nothing**. Worth knowing before wiring `migrate`
into any script that points at a development database.

Production never has this row, so it never prompts.

---

## What we deliberately don't use

Supabase bundles authentication, realtime updates and edge functions. Vardenia uses none of
them: Payload already owns users, sessions and roles, and having two systems believe they
own identity is a problem worth not having. Reasoning is in
[`adr/0006`](adr/0006-supabase-for-hosted-postgres.md).
