# ADR 0001 - Monorepo with Payload CMS inside Next.js

- **Status:** Accepted
- **Date:** 2026-08-06

## Context

Vardenia needs a public website, an editorial CMS, a REST API for a mobile app, and a QR
redirect service. The team is very small. Every additional deployable is a fixed ongoing
cost in secrets management, CI, observability, and - most expensively - schema drift
between services.

## Decision

A pnpm + Turborepo monorepo. `apps/web` is a single Next.js 15 application that hosts
Payload CMS 3, the public site, the REST/GraphQL API, and the QR redirect. `apps/mobile` is
an Expo app. Shared domain logic lives in `packages/*` and is consumed as TypeScript source
via `transpilePackages`.

## Alternatives considered

**Headless SaaS CMS (Sanity, Contentful) + separate Next.js frontend.** Better editor
polish out of the box. Rejected on two grounds: per-seat pricing scales badly once sales
and editorial both need access, and a geo-filtered directory with tier-based ranking is
awkward to express in a document store designed for articles. We would end up mirroring
listings into our own Postgres anyway, at which point we own two sources of truth.

**Separate API service (NestJS/Fastify) + separate admin.** The textbook answer, and the
right one at 20 engineers. At 1-3 engineers it triples the operational surface to solve a
problem we do not have.

## Consequences

- One deploy, one database, one type graph. `payload generate:types` produces types the
  frontend consumes directly.
- Payload is now a hard dependency. Migrating off it later would be a substantial project -
  accepted, because the alternative (building our own admin) is a substantial project
  _now_.
- The single app is a single blast radius. Mitigated by the QR redirect being an isolated
  route handler with no shared state, so it can be extracted to an edge worker without
  touching anything else.
