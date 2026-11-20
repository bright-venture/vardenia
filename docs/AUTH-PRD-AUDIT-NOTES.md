# Authentication PRD: audit notes

Notes from auditing "Vardenia Authentication and Accounts" (PRD dated 20 November 2026), section by section, against the code on `feature/business-onboarding-form` and live tests on the development database.

Each note is one of:

- **Missing from the PRD**: true in the product, but the PRD does not say it. Add it to the next PRD version.
- **Correction**: the PRD says something the product does not do.
- **Fixed**: a gap found and fixed during the audit (the PRD can keep its wording).
- **Open**: needs a decision or a later step.

---

## Step 1. Summary

All six claims hold (three account types, browsing without an account, booking needs a signed-in verified customer, no partner sign-up, admin panel for the team only, business form creates a hidden draft).

| Type          | Note                                                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixed         | A signed-out booking attempt answered "Sign in to book a table." for every kind of place, hotels and chalets included. Now "Sign in to book."                                     |
| Open (step 7) | The PRD says a rejected submission cannot be published. The code lets staff set it back to pending, then publish. Decide if that "reopen" is intended and say so in the PRD.      |
| Open (step 9) | The public data address (`/api/businesses`) lists only a few listings while the database holds many more. Check whether this is a deliberate anti-scraping limit and document it. |

## Step 2. Who can do what

Verified live: sign-in for all three types; sessions of 7 days (customer), 4 hours (partner), 8 hours (team); lockout after 10 / 5 / 5 wrong passwords for 10 minutes; each account reads only its own record; a partner cannot add a listing to themselves or change their password with a session alone; staff cannot make themselves admin; cookies are HttpOnly and SameSite Lax.

| Type                 | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixed                | Partner invitations were never sent. Payload's anti-spam check for "forgot password" looks the account up outside the save that creates it, finds nobody and silently skips. Accounts created by staff or by publishing a submission had no link and no email. The invitation now creates its link inside the same save and sends the email itself.                                                                                                                                                |
| Fixed                | A partner's ordinary "forgot password" link lasted 3 days, because it was the same setting as the invitation. Now: invitation 3 days, ordinary reset 1 hour, and each email states its own lifetime.                                                                                                                                                                                                                                                                                               |
| Fixed                | "Forgot password" revealed that an account exists when the email could not be sent: the answer became an error showing the email provider's own message. It now always answers "Success" and records the failure on the server, for all three account types.                                                                                                                                                                                                                                       |
| Correction           | Team password reset is not "through admin": the admin sign-in page has its own "Forgot password" email with a 1 hour link.                                                                                                                                                                                                                                                                                                                                                                         |
| Correction           | Password reset row should read: customer 1 hour link; partner 1 hour link, except the first-time invitation (3 days); team 1 hour link.                                                                                                                                                                                                                                                                                                                                                            |
| Missing from the PRD | Sign-in is also limited to 10 requests per minute per internet connection, shared across all sign-in, forgot-password, reset, unlock and verify requests. It stops password guessing spread over many accounts, mass lockouts and reset-email spam. Known downside: people sharing one connection (mobile carriers, hotel or office Wi-Fi) share the budget and may see "Too many requests" for up to a minute. Suggested later: count per connection and email, with a higher cap per connection. |
| Missing from the PRD | "Forgot password" can be requested once per 15 seconds per account (Payload default).                                                                                                                                                                                                                                                                                                                                                                                                              |
| Missing from the PRD | A failed sign-in counter resets on a successful sign-in; the lock lifts by itself after 10 minutes.                                                                                                                                                                                                                                                                                                                                                                                                |
