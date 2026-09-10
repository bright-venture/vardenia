# ADR 0007 - Payments wait, and are a per-listing policy when they come

- **Status:** Accepted (deferred)
- **Date:** 2026-09-10

## Context

Bookings exist as a collection (one interval, one business, capacity-checked), but the
public booking flow is not built yet - `create` is staff-only until an endpoint exists that
does the availability check, the capacity-safe insert, and the confirmation email as one
unit. There is no payment anywhere in the system: no price, deposit, or payment status on a
booking, and no gateway.

The temptation is to reach for Stripe now. Two things make that the wrong first move. The
audience is Lebanon, and Stripe does not settle locally there. And Vardenia lists hotels,
restaurants, guesthouses, tour operators, clinics and drivers - their money needs differ, so
"payments" is not one switch.

## Decision

No payments now. Do not add a gateway, a price, a deposit, or a payment status until a real
booking flow needs to move money.

When it is built, payment is a **per-business, per-type policy**, expressed the same way the
booking behaviour already is (see the booking config in `packages/core`), not a global
on/off. And it is built **onto the capacity-safe public booking endpoint**, which does not
exist yet - the two are one piece of work, not a bolt-on.

## Rationale

Sales is consultative at this stage. A payment integration before there are roughly ten
advertisers is speculative work, the same reasoning `docs/ARCHITECTURE.md` records for
deferring self-serve checkout.

The differences by listing type are real and would fight a global switch. A restaurant table
is usually free to book, or takes a small no-show deposit for a large party. A hotel or
guesthouse stay is where a deposit or full prepayment actually matters. So payment belongs
with the per-business booking policy, not above it.

And the hard question is not the code, it is the provider - which we cannot answer from the
keyboard, so building the plumbing first would be building on the wrong assumption.

## The decisions to make when we build it, in order

1. **The provider that clears in Lebanon.** This is load-bearing and everything else hangs
   on it. A local acquirer or Lebanese bank gateway (Areeba and similar) versus a regional
   PSP versus Stripe, which does not settle locally in Lebanon. Decide card schemes accepted,
   settlement currency (USD vs LBP), payout mechanics, and PCI scope - prefer hosted fields
   or a redirect so the app never handles card data.
2. **What is charged, per type.** Restaurant: free, or a no-show deposit for large parties.
   Guesthouse and hotel: a deposit or full prepayment. This is a field on the per-business
   booking policy, not a global flag.
3. **Refunds, keyed to the venue's own notice window.** Closures and a notice period already
   exist in the model; a cancellation and refund policy reads off them. Decide who bears the
   fee on a no-show.
4. **Partner payouts and the platform fee.** How money reaches the venue, on what schedule,
   and what Vardenia keeps.
5. **Where it hooks in.** Onto the capacity-safe public booking endpoint. A payment must not
   be taken before capacity is confirmed, and capacity must not be held without a payment
   intent - the two are one transaction-shaped unit, which is why the endpoint and payments
   are one build.

## What we do now to keep the door open

- Bookings are one interval model with a status lifecycle. A payment status is an added
  field, not a reshape.
- The per-business booking config already carries behaviour that varies by venue (a booking
  starting `pending` vs `confirmed`); a payment policy is the same shape and the same place.
- No currency or price assumption is baked anywhere that a later per-type model would have
  to fight. The listing price band (`$` to `$$$$`) is a display hint, not money.
- The single-country model (ADR 0005) means settlement and currency are Lebanon-specific for
  now, which narrows the provider question rather than widening it.

## Revisit when

A booking actually needs to move money: roughly ten paying venues, or the first venue that
will only accept bookings against a deposit - **and** the public booking endpoint is being
built, so the two land together. If the provider choice turns out to be contentious, give it
its own follow-up ADR; it is the decision most likely to need a paper trail.

## Consequences

- No gateway to integrate, no PCI scope, and no payout reconciliation to run now.
- Bookings stay free and staff-mediated until then. A venue that requires prepayment to
  accept a reservation cannot be fully onboarded yet - that is the cost, and it is also the
  signal that the time to build has arrived.
- The hard part (the provider) is named and deferred deliberately, so it is chosen with real
  requirements rather than discovered late in an integration already half-written.
