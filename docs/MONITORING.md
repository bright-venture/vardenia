# Monitoring and analytics

Two separate things, in two separate places, answering two different questions.

- **Error events** answer "is something broken?" They live in the admin panel.
- **Analytics** answers "is anyone there, and did the print work?" It lives in
  whichever analytics dashboard you signed up for.

Neither is on by default. Both need one environment variable set in the Netlify
dashboard under **Site configuration → Environment variables**.

---

## Errors

### Turning alerting on

Set `ERROR_ALERT_TO` to an address that reaches a person. Unset means errors are
still recorded, just silently.

This one is read at runtime, so changing it takes effect on the next request
rather than needing a rebuild.

### Where to look

Admin panel → **Analytics → Error Events**.

### How to read the table

| Column | What it means |
| --- | --- |
| **Message** | What failed, scrubbed of anything sensitive |
| **Source** | Which part of the site. `booking.confirmation-email`, `auth.profile.verification`, `qr.scan-counter` |
| **Count** | How many times **this same bug** has happened |
| **Last seen** | When it last happened |
| **Resolved** | You tick it. A later occurrence unticks it automatically |

The important thing: **one row is one bug, not one occurrence.** A crash loop is
a single row with a count in the thousands, not thousands of rows. That is what
keeps the table readable, and it is why the count column is the first thing to
look at.

### Reading it in practice

- **High count, recent Last seen** — happening right now. This is the one to act
  on.
- **High count, old Last seen** — was bad, stopped. Probably fixed by something
  else. Tick it resolved and see if it comes back.
- **Count of 1, recent** — could be a one-off network blip. Worth reading, rarely
  worth dropping everything for.
- **Something you ticked resolved that is unticked again** — a regression. This
  is the most valuable signal in the table, because nothing else tells you a fix
  did not hold.

### The alert email

One message, the first time a given bug ever appears. Never again for that same
bug, no matter how many times it repeats.

That is deliberate: the alternative is an inbox full of the same crash. The
subject names the source, so you can tell from a phone whether it is worth
opening.

The trade: a bug you marked resolved that comes back does **not** email again. It
unticks itself in the table instead. So the table is still worth opening
occasionally even with alerting on.

### What this cannot tell you

**If the database is down, nothing lands here** - the error log is in the same
database. `reportError` always writes to the console first, and Netlify captures
that, so the fallback is the platform logs under **Netlify → Logs → Functions**.

It is the one class of outage this cannot report on, and it is not a small one.
An uptime pinger hitting the home page every few minutes is the thing that would
cover it, and there is not one yet.

---

## Analytics

### Turning it on

Set `NEXT_PUBLIC_ANALYTICS_SRC` plus **one** identifier:

| Provider | Variables |
| --- | --- |
| Plausible | `SRC=https://plausible.io/js/script.js` and `DOMAIN=vardenia.com` |
| Umami | `SRC=https://cloud.umami.is/script.js` and `WEBSITE_ID=<id from dashboard>` |

Both are cookieless, which is why there is no consent banner on the site. Adding
Google Analytics would require building one.

`NEXT_PUBLIC_` variables are compiled into the build, so **changing these needs a
redeploy**, not just a save. Nothing loads at all unless both are set, which is
how local development and preview deploys stay out of the numbers.

### What to look at, in order

**1. Pageviews on `/directory/[slug]`.** Is anyone reaching the listings? This is
what an advertiser is buying. Everything else is context for this number.

**2. Referrers.** Where readers come from. Read the caveat below before drawing
conclusions about print.

**3. The `booking-requested` event.** Fires when a booking is actually submitted,
with the resulting status attached (`confirmed` or `pending`). In Plausible you
will need to add it as a Goal in the dashboard before it shows up; Umami lists
events automatically.

### The funnel worth building

Three numbers, from three different places:

| Step | Where it lives |
| --- | --- |
| Scans | Admin dashboard, from `scan-events` |
| Listing pageviews | Analytics dashboard |
| Bookings | The `booking-requested` event, or the Bookings collection |

Scans → views → bookings is the entire pitch to an advertiser. Nothing computes
this for you yet; it is three numbers read off two screens.

### The caveat that matters most

**A QR scan currently appears as "Direct / None" in analytics.**

The `/g/<code>` redirect is a server-side 302 and carries no tracking parameter,
so by the time the browser loads the listing page there is nothing left to say it
came from print. It is indistinguishable from somebody typing the URL.

What you still have: the scan itself is recorded server-side in `scan-events`
with the code, the placement and the issue, so you always know **that** a scan
happened. What you cannot do is follow that reader through the site.

Closing this means adding something like `?utm_source=print` to the redirect
destination. It is a small change and it does not affect what is printed - the
short link on the page stays exactly as it is - but it touches the redirect that
every printed code depends on, so it is a deliberate decision rather than a
detail.

Until then: treat scan counts and pageviews as two separate measurements that
happen to be about the same reader, not as a funnel you can actually trace.

### Why so few custom events

Every named event is something a person has to interpret later. Three that get
looked at beat thirty that do not, and the pageview stream already answers most
questions. Events are declared in `lib/analytics.ts`; adding one is deliberate.
