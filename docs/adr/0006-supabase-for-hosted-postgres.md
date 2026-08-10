# ADR 0006 - Supabase hosts Postgres; we use almost none of the rest

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

The database has to live somewhere once there is a deployed environment. Supabase, Neon,
Railway, RDS and Vercel Postgres are all viable. Supabase additionally bundles auth,
storage, a generated REST API, realtime and edge functions.

## Decision

Supabase, used as **managed Postgres and (later) S3-compatible storage only** - for
development as well as production, with a separate project for each.

The local Docker Postgres was removed rather than kept alongside. Two ways to run the
database means two things to explain, two ways to be misconfigured, and a class of bug that
only appears in one of them. For a solo developer building an MVP, one path is worth more
than the offline capability and lower latency that Docker provided.

Explicitly not used:

- **Supabase Auth.** Payload already owns users, sessions, roles and password reset. Two
  systems believing they own identity is a category of bug with no upside here.
- **The Data API (PostgREST).** See below.
- **Realtime, Edge Functions.** No use case.
- **Row-level security.** Access control is enforced in the application layer
  (`apps/web/src/access/`), returning query constraints per role. RLS would be a second,
  divergent copy of those rules.

## The reason this ADR exists

Supabase's generated REST API is served to the browser with an anon key. Pointed at
Payload's tables it would expose the `businesses` Commercial tab - contract dates, tier,
sales owner, internal notes - which the entire access-control design exists to keep
private. It is on by default.

Turning it off is a dashboard setting, and dashboard settings get switched back on by people
who do not know why they were off. So the primary mitigation is structural: Payload is
configured with `schemaName: 'payload'`, putting every table outside the `public` schema
PostgREST exposes. Disabling the Data API is then a second layer rather than the only one.

## Alternatives considered

**Neon.** Just Postgres - a smaller surface area and nothing to accidentally expose, with
better idle pricing for a pre-launch project. Genuinely close. Supabase wins on having a
usable table browser for non-developers and storage on the same bill, which matters for a
team without a dedicated engineer.

**RDS / self-managed.** Correct at scale, unjustified now - it buys tuning control at the
cost of someone owning backups and upgrades.

## Consequences

- Switching providers stays a one-variable change; `DATABASE_URL` is read in exactly one
  place. Neon or anything else remains available if Supabase disappoints.
- Two connection strings to keep straight: pooled for the app, direct for migrations. This
  trips people up and is documented in `docs/SUPABASE-SETUP.md`.
- Region is fixed at project creation. Frankfurt for a Lebanon-and-GCC audience.
- No offline development, and every query is a network round trip rather than a local
  socket. Accepted deliberately in exchange for one less tool to install and run.
- CI keeps its own throwaway Postgres service container, so builds never touch - or depend
  on - a Supabase project.
- If Supabase Auth is ever wanted (social login for consumers, say), that is a new ADR, not
  a config change.
