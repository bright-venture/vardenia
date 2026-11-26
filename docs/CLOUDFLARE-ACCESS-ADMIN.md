# Two-step sign-in for the admin: Cloudflare Access

Decided 21 November 2026 (authentication audit, step 10). Today a team password alone opens the admin. With Cloudflare Access, a team member must first prove their email (a one-time code, or Google) before the admin page even loads, and only approved addresses get through. Then they sign in with their Vardenia password as usual: two steps.

Free for up to 50 people. No code change. vardenia.com already runs through Cloudflare (the orange cloud), which Access needs. Partners, guests and the public site are not affected.

## What gets protected

Four paths on each hostname the site answers on (`vardenia.com`, and `www.vardenia.com` if it is used):

| Path          | Why                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `admin`       | the admin page itself                                                                                                                |
| `admin/*`     | every page inside it; Cloudflare does not cover `admin` with `admin/*` or the other way round, so both are needed                    |
| `api/users`   | the team's sign-in address                                                                                                           |
| `api/users/*` | team sign-in, forgot password and reset; without this, a stolen password could still sign in through the API and skip the admin page |

Not protected, on purpose: `/api/customers`, `/api/business-users`, `/partner`, `/account` and the scheduled jobs under `/booking`, which guests, partners and Netlify use.

## Steps

1. **Open Zero Trust.** In the Cloudflare dashboard, open **Zero Trust**. The first time, choose a team name (for example `vardenia`) and the **Free** plan.
2. **Turn on the email code.** Go to **Settings, Authentication, Login methods**. Make sure **One-time PIN** is listed; add it if not. Cloudflare sends codes only once this is on. Optional: also add **Google** so the team can sign in with their Google Workspace account.
3. **Add the application.** Go to **Access, Applications, Add an application, Self-hosted**.
   - Name: `Vardenia admin`
   - Session duration: `24 hours` (a team member enters a code at most once a day)
   - Add the four destinations from the table: domain `vardenia.com` with paths `admin`, `admin/*`, `api/users`, `api/users/*`. Repeat for `www.vardenia.com` if the site answers there.
4. **Add the policy.** Name: `Vardenia team`. Action: **Allow**. Include: **Emails**, then list each team member's address (or **Emails ending in** `@vardenia.com` if every team member has one). Save.
5. **Save the application.**

## Check it

In a private browser window:

1. Open `https://vardenia.com/admin`. A Cloudflare page should ask for an email.
2. Enter a team address: a code arrives by email; enter it. The usual Vardenia admin sign-in appears.
3. Try an address that is not on the list: no code is sent, no way in.
4. Open the public site, a listing, `/account/login` and `/partner/login`: they work as before, with no Cloudflare page.

## Good to know

- **The code is valid 10 minutes** and works once; asking for a new one cancels the old one.
- **Adding or removing a team member** is done in two places: the admin (Team) and this Access policy.
- **Password reset emails for the team** open `/admin/reset/...`, so the team member passes Access first, then sets the password. Nothing to change.
- **Do not turn on Bot Fight Mode** while doing this: it once blocked the Netlify scheduled jobs (5 November 2026).

## One gap to close (separate, small code change)

Access only protects requests that go through Cloudflare. Netlify also serves every deploy at its own `*.netlify.app` addresses, which skip Cloudflare, and a production deploy's address talks to the live database. Proposed: the site refuses `/admin` and `/api/users` on any host other than vardenia.com (and the staging address), so Access cannot be walked around.
