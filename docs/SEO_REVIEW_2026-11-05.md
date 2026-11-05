# SEO review — 5 November 2026

## Scope

Read-only checks of public production pages and local technical SEO changes. No deployment, production data changes, Search Console submission, indexing-switch changes or canonical-host changes were performed.

## Public production checks

- https://vardenia.com/ returned HTTP 200. English and Arabic homepages have self-referencing canonical URLs, reciprocal language alternatives and an English `x-default`.
- https://vardenia.com/ar has an Arabic description and Arabic social-card text.
- https://vardenia.com/robots.txt allows public crawling and advertises https://vardenia.com/sitemap.xml. The launch indexing switch is already enabled in the public deployment.
- The fetched sitemap contained 1,363 URL entries. All shared the same last-modified timestamp, confirming it represents sitemap regeneration rather than individual content revisions.
- https://vardenia.com/directory/ta7t-el-shajra confirms the social-card defect: Open Graph uses the listing title and photograph, but Twitter emits the generic homepage title, description and branded image. Its canonical correctly identifies the listing URL.
- Existing Organization, listing and Article structured-data builders use stored facts. This review did not add ratings, claims, business contact details or unsupported schema attributes.

## Changes prepared locally

1. Sitemap requests exclude listings and articles explicitly marked `seo.noIndex`. Static-generation callers keep their prior default behavior, and anonymous access checks remain enabled. Issues have no SEO/noindex group and are unchanged.
2. Removed synthetic sitemap `lastModified` values. Dates should be restored only when backed by actual content revisions.
3. Sitemap language alternatives use the same helper as page metadata, including `x-default`, without changing canonical paths or the locale set.
4. Detail-page Open Graph cards retain the existing branded fallback when no photograph is available and identify the current localized URL and site name.
5. Detail-page Twitter cards now carry the page-specific title, description and image instead of inheriting homepage copy.

## Verification

- 43 focused tests passed across metadata, canonical/hreflang, sitemap, robots and slug-query behavior.
- TypeScript `tsc --noEmit --incremental false` passed at the time of this change.
- ESLint for affected files, Prettier checks and `git diff --check` passed.
- Full aggregate tests/build are coordinated separately because other website changes are in progress.
- Unit tests mock the database. Production database query execution and deployed metadata must be verified after an approved release.

## Remaining priorities

- Search Console: verify ownership if not already verified, inspect sitemap processing and representative English/Arabic listing URLs, review indexing exclusions and Google-selected canonicals, then measure actual impressions/clicks. No Search Console account data was available in this review.
- Content: prioritize accurate unique descriptions and real photographs for high-value listings; review business facts before publishing. Check actual translation completeness per locale: CMS fallback to English is allowed by the current implementation, so language links alone do not prove translated content exists.
- Validate representative listing and article markup with Google's Rich Results Test after deployment. Structured data helps interpretation but does not guarantee a rich result or ranking.
- The article/issue slug readers still cap static/sitemap collection at 1,000/500 respectively; replace with complete pagination before approaching those sizes. Listing pagination already has an explicit completeness check.
- As content grows, consider sitemap splitting before the 50,000-URL limit and only add genuine revision dates, not build dates.
- Public image URLs under `/api/` may be affected by the existing `/api/` robots exclusion. Confirm actual image hosting and crawler access before narrowing that rule; no robots access policy was changed here.
- Run production Core Web Vitals and image-performance measurements before claiming speed improvements. This review did not establish ranking or performance gains.
