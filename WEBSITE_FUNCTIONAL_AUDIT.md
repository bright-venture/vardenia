# Vardenia: Functional Audit, Business Logic Review and Edge Cases

Audit date: 16 October 2026. Branch: `main` at `f4fd1e4`.
Scope: `apps/web` (Next.js 16 + Payload 3.90), `packages/core`, database triggers and migrations.
The Expo app is an unbuilt scaffold and is out of scope.

**How findings were established**

| Label       | Meaning                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| Executed    | Reproduced by running the real application code (in-memory fake for the database, no production data touched). |
| Code-traced | Execution path read end to end in source, including the guards that could have prevented it. Not executed.     |
| Inferred    | Depends on timing or concurrency that was not reproduced. Reported as a potential issue, never as confirmed.   |

Nothing was changed in the application. No production data was read or written. No emails were sent.
The existing unit suite was run: **2,075 of 2,076 tests pass**; the one failure (`src/import/run.test.ts`, a 5 s timeout) passes when run alone and is load-related flakiness, not a defect.

**Status after fixes (16 October 2026):**

- **F-01 fixed:** bookings are billed in the month they end, and a booking already on a live statement is never billed again.
- **F-02 fixed:** every partner of the listing is emailed when a booking is made. A request nobody answers is declined automatically when its time arrives, and the guest is emailed "no answer from the venue". The sweep runs every 15 minutes through a Netlify scheduled function and needs `CRON_SECRET`.
- **F-05 fixed:** a closed date or a listed-only place is refused before anything is written, with the right message in the guest's language. The booking guard's refusals are translated instead of reported as errors.
- **F-06 fixed:** sending skips a venue with no partner account, leaves its statement as a draft, and names it for the team.
- **F-07 fixed:** partner invitation links last 3 days, and the email says so in English and Arabic.
- **F-09 already fixed by the Payload 3.90 upgrade:** a password reset signs out every device, and a password change signs out every device but the current one. A test now keeps sessions switched on, since this depends on them.
- **F-15 fixed:** every staff-only route uses one shared check, which also requires the account to be a staff account.

Every fix has regression tests. The full suite passes: 2,125 tests.

---

## 1. Executive summary

**Overall quality is high.** The booking, billing, account and QR code paths are unusually well guarded: state machines in `packages/core`, server-side guards on every write, database triggers for capacity and per-customer limits, partial unique indexes for "only one" rules, field-level access on every sensitive column, and 2,000+ unit tests. Most classic failure modes (double booking, cross-account access, editing issued statements, deleting printed QR codes, frontend-only authorisation) are already closed.

**The weaknesses are in the money and communication loops between features**, not in individual features:

1. **Revenue leak (High, executed).** A booking that ends in the month after it starts (hotel stays, getaways, multi-day car rentals, a late dinner crossing midnight on the last day) can be billed in **neither** month.
2. **Venues are never told about a new booking request (High, code-traced).** Requests wait silently until someone opens the partner dashboard, and a request nobody answers stays "pending" forever. The guest never hears back.
3. **Venues can remove completed bookings from their fee (business decision).** An owner can mark a past booking cancelled or no-show at any time before the statement is drawn up. It is deliberate and tested, but it is the main lever on revenue, and the guest is emailed "your booking has been cancelled" after they have already been.
4. **Closed dates and statements fail silently in two places (Medium).** Adding closed dates leaves existing bookings in place with nobody told. Sending a statement to a venue with no partner account starts its payment clock while nobody receives it.

**Highest-risk workflows:** booking request to venue answer; month-end billing; partner onboarding.

**Immediate attention (P0):** findings F-01 and F-02.

---

## 2. Feature inventory

| Module            | Features                                                                                                                                                                                                                                            | Main code                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Public site       | Home, 6 section pages, directory with filters and trip bar (dates and party), listing page, search, magazine (articles, issues), about, FAQ, contact, legal, advertise, partner-with-us, add-your-business, scan fallback pages, coming-soon splash | `app/(frontend)/[locale]/**`, `lib/listings.ts`, `lib/search.ts`, `lib/trip*.ts`                                                             |
| Customer accounts | Sign up (Turnstile optional), email verification and resend, login, forgot and reset password, profile (name, email, password), close account, saved places, passport, my bookings                                                                  | `app/auth/**`, `collections/Customers.ts`, `lib/account-deletion.ts`, `app/save`, `lib/passport.ts`                                          |
| Booking           | Availability check, booking request, auto-confirm, customer cancel, confirmation and outcome emails, venue cancellation email, closed dates, capacity and per-customer limits                                                                       | `app/booking/**`, `lib/booking-service.ts`, `lib/availability.ts`, `hooks/guardBookingWrite.ts`, `hooks/notifyBookingStatus.ts`, DB triggers |
| Partner           | Invitation, login, password set and reset, bookings dashboard (accept, decline, cancel, completed, no-show), closed dates, listing view, scans, statements, disputes, invoice                                                                       | `app/(frontend)/[locale]/partner/**`, `components/BookingActions.tsx`, `collections/BusinessUsers.ts`, `collections/Closures.ts`             |
| Billing           | Booking-fee settings per venue, monthly draw-up, auto-complete after 7 days, send drafts, dispute window, outcomes, void and redraw, payment recording, invoice page                                                                                | `lib/statements.ts`, `collections/Statements.ts`, `app/billing/**`, `app/invoice/[id]`, `packages/core/src/booking-fees.ts`                  |
| Reviews           | Submit (completed booking required), moderation, one per customer and listing, highlights                                                                                                                                                           | `app/reviews`, `lib/review-service.ts`, `collections/Reviews.ts`                                                                             |
| QR codes          | Code minting, permanence guards, scan redirect, scan events and counts, print sheet, export, image, nightly backup                                                                                                                                  | `collections/QrCodes.ts`, `hooks/ensureQrCode.ts`, `hooks/protectPrintedCodes.ts`, `app/g`, `app/qr/**`                                      |
| Staff and admin   | Payload admin, reports (listings, scans), billing page, error events and alerts, media, articles, issues                                                                                                                                            | `collections/**`, `app/reports/**`, `hooks/notifyNewError.ts`                                                                                |
| Platform          | Rate limits, shared email cap, CSP and headers, coming-soon gate, SEO (sitemap, robots, structured data), 10 locales and RTL, machine translation hook                                                                                              | `lib/rate-limit*.ts`, `lib/email-cap.ts`, `lib/security-headers.ts`, `proxy.ts`, `lib/seo.ts`                                                |

**Roles:** anonymous visitor; customer (`customers`); partner (`business-users`, scoped to their listings); staff and admin (`users`, roles `staff` | `admin`).

---

## 3. Feature-by-feature audit (business-critical features)

### 3.1 Booking request

- **Purpose:** a verified customer requests a slot; the venue confirms or declines.
- **Workflow:** form (Beirut wall-clock times) to `POST /booking/request` to `createBooking` (availability, 5-booking cap) to `payload.create`, then `guardBookingWrite` (business rules, closures, capacity), then DB triggers (capacity, customer limit), then the customer confirmation email.
- **Assessment:** sound and layered. Customer must be signed in and verified; party size, lead time, advance window, duration and capacity are enforced server-side and again in Postgres under an advisory lock, so double booking is impossible even under concurrency.
- **Problems:** F-02 (venue never notified), F-05 (closed date or listed-only place produces a generic 500), F-13 (no idempotency on retry).
- **Tests:** strong unit coverage (`booking-service`, `availability`, `guardBookingWrite`); no test that the venue learns about a request (there is no such behaviour).

### 3.2 Booking status changes

- **State machine** (`packages/core/src/booking.ts:66-72`): pending to confirmed or cancelled; confirmed to cancelled, completed or no-show; the last three are terminal. Enforced per actor (`:192-213`) in `guardBookingWrite.ts:113-184`.
- **Customer** may cancel until the booking ends. **Owner** may confirm, decline, cancel, complete, no-show; completed and no-show only after the end. **Staff** may do anything allowed by the machine.
- **Problems:** F-03 (owner cancel or no-show after the fact, deliberate), F-11 (concurrent changes last-write-wins), F-17 (cancellation policy is text only; no-show not told to the guest).

### 3.3 Closed dates

- Owners and staff add date ranges; availability, the booking guard and the trip filter all honour them.
- **Problems:** F-04 (existing bookings on new closed dates are untouched), F-10 (lookups capped at 50 unsorted rows).

### 3.4 Monthly booking-fee statements

- **Workflow:** from the 8th of the following month staff draw up drafts (`lib/statements.ts:72-207`); confirmed bookings 7+ days past their end are auto-completed; each completed booking yields a fee line; drafts are sent; owners have 7 days to dispute a line; payment due after 15 days.
- **Assessment:** issued statements are immutable (`Statements.ts:198-227`), statuses only move forward (`statement-moves`), one live statement per venue and month is enforced by a partial unique index, and totals are derived server-side.
- **Problems:** F-01 (cross-month bookings never billed, executed), F-06 (sent with no recipient), F-08 (number race misreported), F-12 (concurrent disputes).

### 3.5 Customer accounts

- Enumeration-safe sign-up and resend; verification required to book or review; re-authentication for email, password and closure; closure revokes sessions, cancels upcoming bookings (venues told), strips notes and saved places, then anonymises.
- **Problems:** F-09 (password change and reset leave other sessions signed in, acknowledged in code).

### 3.6 Partner onboarding

- Staff create a partner; `inviteBusinessUser` sends a "set your password" link.
- **Problems:** F-07 (the link dies after one hour).

### 3.7 Reviews

- Requires a completed booking, or a confirmed one that has ended; one per customer and listing (DB index); moderated before display; author name reduced to first name and initial.
- **Business decision:** F-16 (eligible the moment the booking ends, before the venue can record a no-show).

### 3.8 QR codes, reports and staff tools

- Inspected in this session's earlier security work and re-checked here: printed codes cannot be deleted or re-aimed, scans are counted in SQL, external destinations are admin-only.
- **Problems:** F-15 (four staff routes duplicate a weaker role check).

### 3.9 Saved places, passport, search, trip filter

- Saved places are per customer (access-scoped) with a unique-race fallback; passport is derived from bookings (no stored state to drift); the trip filter reuses `checkAvailability`, so the directory and the booking form agree.
- **Problems:** F-14 (save is a toggle, so a retried request undoes itself).

---

## 4. Confirmed bugs and findings

| ID   | Feature            | Problem                                                                                                 | Severity                                    | Evidence                                                                                                                               | Recommended fix                                                                           |
| ---- | ------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| F-01 | Billing            | A booking that ends in the next month is billed in neither month                                        | **High**                                    | Executed (see 7.1)                                                                                                                     | Bill by checkout month, or carry unbilled bookings forward                                |
| F-02 | Booking            | Venues are never notified of a new request; pending requests never expire                               | **High**                                    | `app/booking/request/route.ts:141-165`, `hooks/notifyBookingStatus.ts:63`                                                              | Email the venue on create; reminder and auto-decline policy                               |
| F-03 | Booking / Billing  | Owner can cancel or no-show a past booking, removing its fee; guest emailed "cancelled" after visiting  | **Business decision** (High revenue impact) | `packages/core/src/booking.ts:194`, `guardBookingWrite.ts:175-184`, test `guardBookingWrite.test.ts:66-70`                             | Decide policy; at minimum no "cancelled" email for past bookings and a staff-visible flag |
| F-04 | Closed dates       | New closed dates ignore existing bookings; guests not told                                              | Medium                                      | `hooks/guardClosureWrite.ts:29-95` (no booking check, no after hook)                                                                   | Warn with the affected bookings, or refuse until handled                                  |
| F-05 | Booking            | Closed date or listed-only place returns a generic 500 and raises an error alert                        | Medium                                      | `lib/booking-service.ts:239-245` (no closures), `:156-182`, `guardBookingWrite.ts:252-257, 343-345`, `route.ts:120-133`                | Pass closures in the service; map guard reasons to proper codes                           |
| F-06 | Billing            | Statement "sent" to a venue with no partner account: clocks start, nobody receives it, nothing reported | Medium                                      | `lib/statement-email.ts:136-186`, `collections/Statements.ts:306-314`                                                                  | Refuse to send without a recipient, or report it to staff                                 |
| F-07 | Partner onboarding | Invitation link expires after 1 hour; email does not say so                                             | Medium                                      | `hooks/inviteBusinessUser.ts:38-55`, `collections/BusinessUsers.ts:58-64` (no `expiration`), Payload default 3,600,000 ms              | Longer expiry for invitations, or say so and link to "forgot password"                    |
| F-08 | Billing            | Statement numbers race; draw-up reports any unique violation as "already drawn up"                      | Medium                                      | `collections/Statements.ts:89-103`, `lib/statements.ts:189-202`                                                                        | Number from a DB sequence; only treat the period index as "already drawn up"              |
| F-09 | Accounts           | Password change and reset do not sign out other sessions                                                | Medium                                      | `app/auth/profile/route.ts:158-167` (comment), `app/auth/reset/route.ts:66-110`                                                        | Call `revokeAllSessions` (keep the current one on change)                                 |
| F-10 | Closed dates       | Closure lookups take 50 unsorted rows; a venue with more future closures can be booked on a closed day  | Low (confirmed limit)                       | `guardBookingWrite.ts:301-311`, `app/booking/availability/route.ts:77-90`; drizzle `findMany` applies `limit` with `pagination: false` | Bound the query to the booking's days instead of a row count                              |
| F-11 | Booking            | Concurrent owner confirm and customer cancel: last write wins                                           | Low (inferred)                              | `guardBookingWrite.ts:113-137` reads `originalDoc`, no conditional update                                                              | Compare-and-set on status, or a status-transition trigger                                 |
| F-12 | Billing            | Two disputes on one statement at once: one is lost                                                      | Low (inferred)                              | `collections/Statements.ts:158-179` rewrites all lines from `originalDoc`                                                              | Lock the row, or store disputes in their own collection                                   |
| F-13 | Booking            | A retry after a timeout can create a duplicate booking                                                  | Low (inferred)                              | `app/booking/request/route.ts` has no idempotency key                                                                                  | Client-generated request id, unique per customer                                          |
| F-14 | Saved places       | Save is a toggle; a retried or doubled request undoes itself                                            | Low (inferred)                              | `app/save/route.ts:94-137`                                                                                                             | Send the desired state (`saved: true/false`)                                              |
| F-15 | Staff routes       | Four routes check `roles` without checking the account is staff                                         | Low (not exploitable today)                 | `app/reports/listings/route.ts:28-31`, `reports/scans:28-31`, `qr/export:116-119`, `qr/sheet:29-32`                                    | Use `isStaffRequest` everywhere                                                           |
| F-16 | Reviews            | Review allowed the moment a booking ends, before a no-show can be recorded                              | Business decision                           | `lib/review-service.ts:83-105`                                                                                                         | Align with the 7-day rule, or let staff unpublish                                         |

---

## 5. Edge cases checklist

| Area         | Edge case                                                          | Expected                         | Status                               |
| ------------ | ------------------------------------------------------------------ | -------------------------------- | ------------------------------------ |
| Booking      | Two customers take the last slot at once                           | One succeeds, one "fully booked" | Covered (advisory lock trigger)      |
| Booking      | Same customer sixth upcoming booking, in parallel                  | Refused                          | Covered (customer-limit trigger)     |
| Booking      | Double-click submit                                                | One request                      | Covered (button disabled while busy) |
| Booking      | Network timeout, then retry                                        | One booking                      | **Gap** F-13                         |
| Booking      | Booking on a closed date (race or API)                             | Clear "closed" message           | **Gap** F-05                         |
| Booking      | Request for a listed-only place via API                            | Clear refusal                    | **Gap** F-05 (generic 500)           |
| Booking      | Start in the past, too soon, too far, too long, party out of range | Refused with reason              | Covered                              |
| Booking      | Visitor in another time zone                                       | Beirut times                     | Covered (`beirutInstant`)            |
| Booking      | Unverified customer                                                | Refused                          | Covered                              |
| Booking      | Venue never answers                                                | Guest told, slot released        | **Gap** F-02                         |
| Status       | Customer cancels after the booking ended                           | Refused                          | Covered                              |
| Status       | Owner cancels after the booking ended                              | Policy                           | **Decision** F-03                    |
| Status       | Completed or no-show before the end                                | Refused (non-staff)              | Covered                              |
| Status       | Terminal status changed again                                      | Refused                          | Covered                              |
| Status       | Owner and customer act at the same moment                          | One consistent outcome           | **Potential** F-11                   |
| Closed dates | Closure added over existing bookings                               | Warn or handle                   | **Gap** F-04                         |
| Closed dates | More than 50 future closures                                       | All honoured                     | **Gap** F-10                         |
| Billing      | Stay crossing month end                                            | Billed once                      | **Bug** F-01                         |
| Billing      | Draw-up twice at once                                              | One statement                    | Covered (partial unique index)       |
| Billing      | Two statements numbered at once                                    | Distinct numbers                 | **Gap** F-08                         |
| Billing      | Edit lines after sending                                           | Refused                          | Covered                              |
| Billing      | Dispute after 7 days                                               | Refused                          | Covered                              |
| Billing      | Venue without partner account                                      | Staff warned                     | **Gap** F-06                         |
| Billing      | Paid while a dispute is open                                       | Policy                           | **Decision** (section 7)             |
| Accounts     | Sign up with an existing email                                     | Same answer, reset email         | Covered                              |
| Accounts     | Password reset or change with stolen session                       | Other sessions end               | **Gap** F-09                         |
| Accounts     | Close account with upcoming bookings                               | Cancelled, venues told           | Covered                              |
| Partner      | Invitation opened next day                                         | Works or explains                | **Gap** F-07                         |
| Partner      | Owner reads another venue's bookings or statements                 | Refused                          | Covered (access scoped by owned ids) |
| Reviews      | Second review, in parallel                                         | Refused                          | Covered (DB index)                   |
| Saved        | Doubled request                                                    | Final state as intended          | **Potential** F-14                   |
| QR           | Delete or re-aim a printed code                                    | Refused                          | Covered                              |

---

## 6. Cross-feature problems

1. **Booking to billing (F-01).** Fees are selected by the month a booking _starts_ (`statements.ts:123-136`), but a booking only counts once it has _ended_ plus 7 days (`booking-fees.ts:104-113`). The statement day is fixed at the 8th (`booking-fees.ts:54, 198-200`). Anything ending after the 1st of the next month is not yet countable on draw-up day, and next month's query never looks back.
2. **Booking to partner (F-02).** The booking is created and the customer is emailed, but nothing reaches the venue. Combined with no expiry for pending, a request can sit unanswered until its date passes.
3. **Partner status to billing and guest email (F-03).** One owner action changes three things at once: the fee disappears, the passport stamp disappears, and the guest receives "your booking has been cancelled" after their visit (`booking-email.ts:883-888` maps confirmed to cancelled as "cancelled").
4. **Closed dates to bookings (F-04).** The availability engine respects closures for new requests only.
5. **Statements to partner accounts (F-06).** A statement's legal clock (dispute window, due date) starts on "sent" whether or not anyone was emailed.
6. **Booking service and booking guard disagree (F-05).** The service checks availability without closures and without bookability; the guard checks both. The guard's refusals are not translated, so they surface as unexpected errors and page the error alert.

---

## 7. Missing validations and business rules

### 7.1 Evidence for F-01 (executed)

The real `drawUpStatements` was run against an in-memory fake of its three queries (script kept outside the repo). Venue with a fee of 10 per night:

```
2026-10 drawn up 2026-11-08 10:00: created=1 nothingOwed=0 | billed: INMONTH1 x2
2026-11 drawn up 2026-12-08 10:00: created=0 nothingOwed=1 | billed: no statement
CROSSES1 (Oct 30 to Nov 2, confirmed) billed anywhere: false
CROSSES1 status now: confirmed
```

A 3-night stay (30 Oct to 2 Nov) is never billed and is never auto-completed.

### 7.2 Rules that are absent or need a decision

- **Pending expiry:** no rule for a request the venue never answers (F-02).
- **Late cancellation by owners:** allowed without limit (F-03).
- **Cancellation policy:** stored as free text (`availability.ts:82`); customers can cancel up to the booking's end regardless.
- **No-show communication:** the guest is not told they were marked no-show (`outcomeFor` returns null), and cannot contest it.
- **Capacity unit:** capacity counts overlapping _bookings_, not guests or rooms, and is per venue, not per room type (`availability.ts:288-302`, trigger `20260818_181600`). A hotel with room types cannot express "2 suites, 10 doubles".
- **Default duration for stays:** booking rules default to a 240-minute maximum (`fields/bookingRules.ts:143-147`); a stay venue enabled with defaults refuses every stay as "too long".
- **Paying with an open dispute:** `sent` to `paid` is allowed while a line is still `open`.
- **Review timing:** see F-16.
- **Statement without recipients:** see F-06.

---

## 8. Testing gaps

| Gap                                  | Kind                                 | Suggested test                                                                      |
| ------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------- |
| Cross-month booking billing          | Unit (`lib/statements.test.ts`)      | Booking 30 Oct to 2 Nov, draw up Oct on 8 Nov and Nov on 8 Dec: billed exactly once |
| Venue notified of a new request      | Unit (route or service)              | Create a booking: one email to each owner of the listing                            |
| Closure over existing bookings       | Unit (`guardClosureWrite.test.ts`)   | Closure over a confirmed booking: warns or refuses (per decision)                   |
| Guard refusals mapped                | Unit (`booking-service.test.ts`)     | Guard throws "closed-period": outcome `unavailable`, not `error`                    |
| Statement with no owners             | Unit (`Statements.test.ts`)          | Sending reports or refuses when zero emails go out                                  |
| Invitation expiry                    | Unit (collection config)             | `forgotPassword.expiration` for partners is at least N days                         |
| Number collision vs period collision | Unit (`statements.test.ts`)          | A `number` unique violation is not counted as "already drawn up"                    |
| Sessions after password change       | Integration                          | Second session is rejected after a change or reset                                  |
| Concurrency (status, disputes)       | Integration against a local Postgres | Two parallel updates: consistent final state                                        |
| End-to-end journeys                  | None exist                           | Browser test: sign up, verify, book, partner accepts, guest cancels                 |
| Flaky timeout                        | Test infra                           | `src/import/run.test.ts:252` times out under full-suite load; raise its timeout     |

---

## 9. Prioritised fix plan

**P0: critical**

- F-01 Cross-month billing leak.
- F-02 Notify venues of new requests; define what happens to unanswered ones.

**P1: important functional problems**

- F-03 Decide the after-the-fact cancel and no-show policy; stop "cancelled" emails for past bookings.
- F-04 Closed dates over existing bookings.
- F-05 Closed or listed-only refusals shown as errors.
- F-06 Statements sent to nobody.
- F-07 Partner invitation expiry.

**P2: reliability**

- F-08 Statement numbering race.
- F-09 Revoke sessions on password change and reset.
- F-10 Closure lookup cap.
- F-11, F-12 Compare-and-set for booking status and disputes.
- F-13 Idempotent booking requests.

**P3: minor**

- F-14 Idempotent save.
- F-15 Centralise the staff check.
- F-16 Review timing.
- Flaky importer test timeout.

---

## 10. Coverage matrix

| Feature                                        | Status                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| Booking request and availability               | Confirmed issue (F-05); otherwise verified working by code trace and existing tests |
| Capacity and per-customer limits (DB triggers) | Verified working (code trace, trigger source)                                       |
| Booking status machine                         | Verified working; business decision required (F-03)                                 |
| Venue notification of requests                 | Confirmed issue (F-02)                                                              |
| Booking emails to guests                       | Verified working by code trace                                                      |
| Closed dates                                   | Confirmed issue (F-04, F-10)                                                        |
| Trip bar availability filter                   | Verified working by code trace (shares the availability engine)                     |
| Statement draw-up                              | Confirmed issue (F-01 executed, F-08)                                               |
| Statement send and email                       | Confirmed issue (F-06)                                                              |
| Disputes                                       | Potential issue requiring verification (F-12)                                       |
| Invoice page                                   | Verified working (access scoped to staff or owning partner, sent or paid only)      |
| Sign up, verify, resend, reset                 | Verified working by code trace; confirmed issue F-09                                |
| Profile and email change                       | Verified working by code trace; confirmed issue F-09                                |
| Account closure                                | Verified working by code trace and tests                                            |
| Partner invitation                             | Confirmed issue (F-07)                                                              |
| Partner dashboard and actions                  | Verified working by code trace (field-level locks)                                  |
| Reviews                                        | Verified working; business decision required (F-16)                                 |
| Saved places                                   | Potential issue requiring verification (F-14)                                       |
| Passport                                       | Verified working by code trace (derived, no stored state)                           |
| QR codes, scans, sheet, export                 | Verified working (earlier audit this week, re-checked); F-15                        |
| Reports                                        | Verified working; F-15                                                              |
| Search and directory filters                   | Not tested beyond existing unit tests                                               |
| Magazine, static pages, SEO                    | Not tested beyond existing unit tests                                               |
| Machine translation hook                       | Not tested (off unless `LIBRETRANSLATE_URL` is set)                                 |
| Admin panel UI behaviour                       | Not tested (no browser session against the admin)                                   |
| End-to-end browser journeys                    | Not tested (no end-to-end suite exists; not run against production by design)       |

---

## Phase 9: proposed fixes (not applied)

Safest order: F-15, F-09, F-05, F-07, F-06, F-04, F-02, F-01, F-08, then the concurrency items. The order runs from the smallest and most contained change to the ones that alter money or emails.

**F-01 Cross-month billing.** Recommended: select a period's bookings by **end** date (checkout month) instead of start date in `lib/statements.ts:123-136`. A booking that ends in October has at most until 31 October 23:59, plus 7 days, which is before 8 November. Every booking in the period is therefore countable on draw-up day, and none can fall between two statements.

- _Alternative:_ keep start-month billing and add a carry-forward: next month's draw-up also selects `confirmed` or `completed` bookings from earlier periods that no statement line references yet.
- _Regression risk:_ a booking that starts in one month and ends in the next moves to the later statement. Check the partner statement page and invoice labels ("day" shown per line), and announce the rule to venues.
- _Test:_ section 8, first row, plus "billed exactly once across two consecutive months".

**F-02 Venue notification.** Add `sendVenueNewRequest` beside `sendVenueCancellation` (`lib/booking-email.ts`), called from the booking route after `createBooking` succeeds, to every `business-users` owner of the listing. The email covers pending and auto-confirmed bookings and links to `/partner?status=pending`. Decide separately: a reminder after N hours, and auto-decline at the booking's start with the guest told.

- _Regression risk:_ email volume (the shared send cap in `lib/email-cap.ts` applies) and venues with no partner account, who get nothing (staff report needed).

**F-03 Policy.** Options, smallest first:

- (a) no guest email when a booking is cancelled after its end;
- (b) require a reason and show staff a monthly list of after-the-fact cancellations and no-shows per venue;
- (c) forbid owner cancel after the end (no-show only).

(c) changes a tested behaviour (`guardBookingWrite.test.ts:66-70`) and needs your decision.

**F-04 Closed dates.** In `guardClosureWrite`, find occupying bookings inside the range. Recommended: refuse with the list of references, so the venue declines or cancels them first and each guest is told by the existing emails.

- _Regression risk:_ a venue cannot close a day until its bookings are handled. That is intended.

**F-05 Refusal mapping.** Pass closures into `createBooking`'s `checkAvailability` (the same query as the availability route), check `canTakeBookings` before creating, and extend `translateInsertError` to recognise every `unavailableMessage` reason.

- _Regression risk:_ none expected; messages become localised.

**F-06 Statements without recipients.** In `sendDrafts`, skip any draft whose venue has no partner email and list it in the staff message. Alternatively, let `emailWhenSent` report when zero emails went out.

- _Regression risk:_ none to existing statements.

**F-07 Invitation expiry.** Set `auth.forgotPassword.expiration` on `business-users` to a few days, or add a separate invitation token. Mention the validity in the email.

- _Regression risk:_ reset links for partners also last longer. Acceptable for partners, or use a separate token.

**F-08 Numbering.** Allocate numbers from a Postgres sequence per year, or retry on a `number` collision. In `drawUpStatements`, count as "already drawn up" only a violation of `statements_one_per_venue_month`.

**F-09 Sessions.** After `resetPassword`, call `revokeAllSessions`. After a password change, revoke every session except the current one (needs the current session id from the token).

- _Regression risk:_ users signed in on several devices are signed out there. That is intended.

**F-10 Closure lookups.** Replace `limit: 50` with a range bound (`startsOn <= lastDay` and `endsOn >= firstDay`) in the guard and the availability route, as the trip filter already does.

**F-11 to F-14 Concurrency.**

- _F-11:_ a `BEFORE UPDATE` trigger on bookings enforcing the transition table, or `UPDATE ... WHERE status = $from`.
- _F-12:_ disputes as a separate collection, or a row lock in the dispute route.
- _F-13:_ an optional `requestId` stored on the booking with a unique index per customer.
- _F-14:_ `{ slug, saved }` with the desired state.

**F-15.** Replace the inline role checks with `isStaffRequest` (`lib/billing-auth.ts:9-16`).
