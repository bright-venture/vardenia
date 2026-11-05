# Category and hub SEO implementation

## Implemented locally

- Added specific English and Arabic titles/descriptions for all six category hubs. Each explains the category and names Lebanon. Copy describes the current taxonomy without pricing, availability, rankings or verification claims.
- Kept existing translated copy for the other eight languages, navigation labels, visible headings, filtering and canonical URLs.
- Routed category, directory and magazine hub metadata through the shared metadata builder. Open Graph and Twitter now describe the current hub rather than inheriting the homepage title/description. The existing branded image remains the default.
- Preserved the site's indexing switch and reciprocal language alternatives.

## English title examples

- Hotels & Getaways in Lebanon
- Restaurants, Cafés & Nightlife in Lebanon
- Things to Do & Places to Visit in Lebanon
- Wedding & Event Planners in Lebanon
- Shopping Malls & Gyms in Lebanon
- Car Rental & Airport Transfers in Lebanon

The site title template appends the brand; it is not duplicated in these strings. Arabic counterparts are maintained alongside the English copy in `src/lib/section-seo.ts`.

## Files

Under `apps/web`:

- `src/lib/section-seo.ts`
- `src/lib/section-seo.test.ts`
- `src/app/(frontend)/[locale]/[section]/page.tsx`
- `src/app/(frontend)/[locale]/directory/page.tsx`
- `src/app/(frontend)/[locale]/magazine/page.tsx`
- `src/app/(frontend)/[locale]/magazine/articles/page.tsx`
- `src/app/(frontend)/[locale]/magazine/issues/page.tsx`

## Verification and next steps

Tests cover every category's English/Arabic copy, uniqueness, practical length limits, retained translations for the other locales, existing canonical URLs, indexing protection, and use of the shared builder by all five hub route types. Length limits are an editorial guardrail, not a guarantee of search-result display.

No deployment, production CMS edits, Search Console settings changes or ranking claims. After an authorized release, inspect rendered English/Arabic snippets and social cards, then use actual query and conversion data to guide further revisions. Original bilingual guides and reviewed listing content remain the next substantive content tasks; they require real source facts and images rather than generated claims.
