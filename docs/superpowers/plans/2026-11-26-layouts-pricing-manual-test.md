# Magazine Places layouts: manual test, A to Z

Run this top to bottom on a **local copy** of the staging database. Tick each line. All tables are in schema `payload`.
`psql` examples assume `psql "$DB"`; replace `$DB` with your local connection string.

## 0. Before you start (do not skip)

- [ ] **Never run this against the shared staging or production database.** This code is uncommitted and the migration has never run; `down` drops columns. Restore a staging dump into a local Postgres and point `DATABASE_URL` in `.env` at it. Check what `.env` points at first.
- [ ] Take the dump first: `pg_dump "$STAGING" -Fc -f staging-before.dump`, then `createdb vardenia_test && pg_restore -d vardenia_test staging-before.dump`.
- [ ] **Schema push.** In development Payload pushes the schema straight from the code when the target is a local database or the one named in `SEED_ALLOWED_DB` (`mayPushSchema`). If `pnpm dev` or the seed starts before the migration runs, push creates the new tables and the migration then fails on "already exists", and you would be testing push, not the migration. **So run the migration (section 1) before you start `pnpm dev` or any seed.**
- [ ] Set `SEED_ALLOWED_DB=<user>@<host>/<database>` (no password, no port) to your local database, or the seed refuses.
- [ ] Email: if `RESEND_API_KEY` is unset, owner emails are written to the **server log** (the terminal running `pnpm dev`). If it is set, use your own addresses, or set `EMAIL_OVERRIDE_TO=you@example.com` so everything lands with you. Read emails from the log or that inbox.
- [ ] Turnstile: if `TURNSTILE_SECRET_KEY` is empty the check is skipped. Easiest: blank it in your local `.env`.
- [ ] Each run needs a **fresh owner email** (max 3 open forms per email, `MAX_OPEN_STARTS_PER_EMAIL`), or wait 30 minutes for abandoned drafts. A 429 means wait a minute.
- [ ] If the admin needs it: `pnpm --filter @vardenia/web generate:importmap`.

## 1. Migration up, down, up (acceptance check)

Run before `pnpm dev`. From `apps/web`:

1. `pnpm migrate:status`: `20261126_120000_page_layouts` is pending, and it is the last one.
2. `pnpm migrate`. [ ] No error.
3. Check the new schema exists:
   ```sql
   select table_name from information_schema.tables
    where table_schema='payload' and table_name in ('templates','templates_pages','issues_layouts');          -- 3 rows
   select column_name from information_schema.columns where table_schema='payload' and
    ((table_name='issues' and column_name in ('template_id','slots')) or
     (table_name='listing_ranges' and column_name in ('first_page','last_page')) or
     (table_name='businesses' and column_name in ('page_layout','submission_terms_layout','submission_terms_issue','submission_terms_page')));  -- 8 rows
   select count(*) from payload.issues where template_id is not null;                          -- 0 (existing issues have no template)
   select count(*) from payload.businesses where page_layout is not null;                      -- 0
   ```
   Also check row level security is on for the new tables: `select relname, relrowsecurity from pg_class where relname in ('templates','templates_pages','issues_layouts');` all `t`.
4. `pnpm migrate:down`. [ ] No error. Re-run the first two queries: **0 rows / 0 columns**. The old data (`businesses`, `issues`) row counts are unchanged.
5. `pnpm migrate` again. [ ] Same result as step 3. Pass = up, down, up all clean.

## 2. Settings

Admin → Settings → Magazine places: confirm currency (USD) and downpayment percent (the expectations below assume **50**). Bump the **terms version** to a new value (PRD section 6 expects it changed). [ ] Saved.

## 3. Start the app and seed the sample data

1. `pnpm dev` (from `apps/web`). Open `/admin`, log in as staff.
2. `pnpm seed:layouts` (dry-run). [ ] It says it would create the template and "Sample issue (test values)", set prices and create 7 blocks, and creates nothing.
3. `pnpm seed:layouts --apply`. [ ] No error. **Warning:** the sample issue (number 9001) is a real, dated issue, so it shows wherever issues are listed on this copy.
4. Database checks:

   ```sql
   select id, name, locked from payload.templates;                               -- 1 row, locked = t
   select count(*) from payload.templates_pages;                                  -- 98 rows
   select i.id, i.issue_number, i.template_id, i.page_count, i.listing_total,
          jsonb_array_length(i.slots) as slots
     from payload.issues i where i.issue_number = 9001;                          -- page_count 100, listing_total 251, slots 251
   select layout, offered, price from payload.issues_layouts
     where _parent_id = (select id from payload.issues where issue_number=9001) order by _order;
        -- 5 rows: full-spread 3000, full-page 1500, half-page 800, three-third 600, quarter-page 300, all offered
   select governorate, first_page, last_page, "from", "to" from payload.listing_ranges
     where issue_id = (select id from payload.issues where issue_number=9001) order by first_page;
   ```

   `templates_pages` has one row per page entry: 2 spreads + 20 + 25 + 25 + 26 = 98 rows (the spreads cover 2 pages each, so 100 pages).
   Expected blocks (computed from the seed's own rules, no database):

   | Governorate   | Pages  | Numbers | Layouts in the block (slot numbers, count)         |
   | ------------- | ------ | ------- | -------------------------------------------------- |
   | beirut        | 1-14   | 1-12    | full-spread 1-2 (2), full-page 3-12 (10)           |
   | matn          | 15-29  | 13-32   | full-page 13-22 (10), half-page 23-32 (10)         |
   | keserwan      | 30-43  | 33-60   | half-page 33-60 (28)                               |
   | north-lebanon | 44-57  | 61-96   | half-page 61-72 (12), three-third 73-96 (24)       |
   | beqaa         | 58-71  | 97-138  | three-third 97-138 (42)                            |
   | chouf         | 72-86  | 139-195 | three-third 139-147 (9), quarter-page 148-195 (48) |
   | south-lebanon | 87-100 | 196-251 | quarter-page 196-251 (56)                          |

   Sample labels: slot 1 = "Pages 1-2", slot 3 = "Page 5", slot 33 = "Page 30, position 1", slot 34 = "Page 30, position 2", slot 73 = "Page 50, position 1", slot 148 = "Page 75, position 1".
   [ ] Every row matches. The `from`/`to` come from the pages, you did not type them.

## 4. Admin refusals (should all be blocked)

- [ ] Open the template, change a page's layout or add a page: refused, "This template is used by an issue and cannot be edited. Duplicate it to make a changed copy."
- [ ] Try to delete the template: refused.
- [ ] Duplicate it: the copy opens **unlocked** (`select name, locked from payload.templates;` shows `f` for the copy). Delete the copy afterwards.
- [ ] On the sample issue's price table set a price of `0`: refused.
- [ ] On the sample issue, try to change its template to another: refused (ranges exist, "Delete this issue's listing number ranges first...").
- [ ] On "All Lebanon", assign the template: refused with the same "ranges first" message. (That is the intended rule. Do **not** delete its ranges.)
- [ ] Listing number ranges: edit a Beirut block to pages 1-3 so a spread is cut in half (pages 3-4 is a spread): refused. Overlapping blocks: refused.

## 5. The owner flow (happy path)

Use a fresh email. Choose **Keserwan** to test a block that has only half pages.

1. Open `/<locale>/magazine-places`. [ ] Step 1 shows the fields, a **layout radio group** (the five sizes), and a number picker that says to choose a layout first.
2. Fill the fields. The city must belong to the governorate chosen (Keserwan).
3. Choose governorate Keserwan, issue "Sample issue (test values)". [ ] Only **Half page** has slots; the other sizes say they are not offered for this region (the form lists all five). Prices shown: half page 800.
4. Choose Half page. [ ] The picker lists 28 free slots as text: "Page 30, position 1" ... up to the Page 43 pair. [ ] Choosing a different size clears the picked slot.
5. Compare with the numbers route in a second terminal (also proves no owner data leaks):
   ```
   curl -s "http://localhost:3000/place-submissions/numbers?governorate=keserwan" | jq .
   ```
   [ ] One issue with a `layouts` array: only `half-page`, `price` 800, `downpaymentAmount` 400, `free` 28, `slots` with number/page/position/lastPage. [ ] No names, emails or business ids anywhere in the JSON.
6. Pick slot 33 ("Page 30, position 1") and press **Next**.
   ```sql
   select id, listing_number, page_layout, issue_id, submission_status, submission_payment_stage,
          submission_payment_price, submission_payment_downpayment_amount, submission_payment_currency
     from payload.businesses order by id desc limit 1;
   ```
   Expected: `listing_number` 33, `page_layout` half-page, `issue_id` = the sample issue, status `incomplete`, price **800**, downpayment **400**, currency USD. **Note this business id.**
7. Step 2 (phone upload): upload the logo and main photo from your phone (or the QR link). [ ] Ticks appear.
8. Step 3: [ ] shows price **800**, downpayment **400**, from the quote returned by Next. Accept the terms and **Submit**.
   ```sql
   select submission_status, submission_payment_stage, submission_payment_price,
          submission_payment_downpayment_amount, submission_payment_still_to_pay,
          submission_terms_version, submission_terms_layout, submission_terms_issue,
          submission_terms_page, submission_terms_price_at_acceptance, submission_terms_currency
     from payload.businesses where id = <ID>;
   ```
   Expected: status `awaiting_downpayment` (verify what you actually see), stage `none`, price 800, downpayment 400, still to pay 800, terms version = the one you set in step 2, layout "Half page" (label), issue "Sample issue (test values)", page "Page 30, position 1", price at acceptance 800.
9. Step 4 "thank you" shows. [ ] The owner email (server log or inbox) says "listing number" (not "page number") and contains one line: Layout, Issue, Page, No. 33. [ ] Check the English and, with the Arabic locale, the Arabic version.

## 6. Staff payment flow (admin, Businesses → the new business)

1. [ ] The business cell shows layout "Half page", "Page 30, position 1"; the payment panel header shows layout, price 800, downpayment expected 400, received 0, still to pay 800. There is **no control to edit the layout**.
2. Record the downpayment of 400. Expected (verify): status `pending`, stage `downpayment_paid`.
   ```sql
   select submission_status, submission_payment_stage, submission_payment_received, submission_payment_still_to_pay
     from payload.businesses where id = <ID>;
   select * from payload.businesses_submission_payments where _parent_id = <ID> order by _order;
   ```
   [ ] One payment line of 400, received 400, still to pay 400. Check the email you got.
3. **Accept**. Expected: status `accepted`, balance due date set (`submission_payment_balance_due_at`), the accepted email lists layout, issue, page and listing number.
4. Record the balance of 400. Expected: status `paid`, stage `fully_paid`, still to pay 0.
5. Use Payload's normal **Publish** button. Expected: status `approved`, the business is public.
6. [ ] Every owner email you received carried the layout line and "listing number" wording.

## 7. Reports

- [ ] Admin → place reports: a new table per issue and layout. For the sample issue, half-page: 50 slots (numbers 23-72), held 1, sold 1 (paid/approved), expected 800, received 800. Other layouts show zeros. Legacy businesses are not in the table.
- [ ] The Businesses list can be filtered by Layout (the native filter on `pageLayout`).

## 8. Write-once and slot rules (all must be refused)

Using the business from section 6 (or a second one):

- [ ] Admin: the layout field is read-only. Via REST as staff: `PATCH /api/businesses/<ID>` with `{"pageLayout":"full-page"}` is refused/ignored (verify in the DB that `page_layout` is still `half-page`).
- [ ] Change the listing number to **3** (a full-page slot): refused (not a slot of that layout).
- [ ] Change the listing number to **60** (half-page slot, Keserwan block): allowed. Change it to **61** (half-page but North Lebanon's block): refused. Put it back to 33.
- [ ] Sample issue → price table: switch **half-page off**: refused while a business holds one of its slots.
- [ ] Staff create a new business by hand with a listing number on the sample issue and no layout: refused.

## 9. Race on the last slot (acceptance check)

1. Pick a layout with few slots in one block: Beirut **full-spread** (slots 1 and 2). Complete one form for slot 1 up to Next (status `incomplete`, number held).
2. Open **two** browsers with different emails, both on Beirut, Full spread. Both pick slot **2** (the last free one). Press Next in both within a second.
3. [ ] Exactly one gets through. The other is refused cleanly and, after the reload, the picker shows no free spread slot (shows "no free" for that layout) instead of a crash.
   ```sql
   select listing_number, count(*) from payload.businesses
    where issue_id=<SAMPLE_ISSUE_ID> and listing_number in (1,2) and deleted_at is null group by 1;
   ```
   Expected: each number has at most **1** row.

## 10. Price edited after Next (acceptance check)

1. Start a new form (fresh email, Matn, Full page, slot 13) and stop on step 3 (price shown).
2. In admin change the sample issue's **full-page price to 1700** and save.
3. Back on step 3: [ ] still shows 1500. Submit: [ ] the row has price 1500, downpayment 750:
   `select submission_payment_price, submission_payment_downpayment_amount from payload.businesses where id=<ID>;`
4. Start another new form: [ ] shows 1700. Set the price back to 1500 afterwards.

## 11. Reject releases the slot

1. On the business from section 10, use **Reject** (not accepted).
2. [ ] Status becomes `rejected` and the listing number is released:
       `select listing_number, submission_status from payload.businesses where id=<ID>;` shows listing_number empty.
3. [ ] The slot is offered again in the form (`curl .../numbers?governorate=matn` lists slot 13 under full-page).

## 12. Legacy data is untouched

- [ ] In the form choose a governorate whose issue is **All Lebanon** (it has no template): it offers no layouts ("not offered for this region", no price).
- [ ] Old businesses open in the admin with a dash for layout and their old prices.
- [ ] `select count(*) from payload.businesses where page_layout is null and listing_number is not null and issue_id in (select id from payload.issues where template_id is not null);` returns **0** (any rows here are businesses holding a slot without a layout, the bad case the new rule prevents).

## 13. Clean-up

- [ ] Reject or delete the test businesses, optionally delete the sample issue and template (the template stays locked while an issue uses it).
- [ ] Re-check section 1 on a restored copy if you changed the migration afterwards.

## What I could not check from the code

Real hook order in Payload (template lock), the `slots exists` query on the issues table, the native layout filter in a running admin, native-language review of the 8 locales that carry English text, and the exact admin button labels (they are described above from the code, read what you see).
