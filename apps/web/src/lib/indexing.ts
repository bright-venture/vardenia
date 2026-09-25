/**
 * Whether search engines may index this deployment.
 *
 * Vardenia went live on its real domain before there was anything in the
 * directory. Google indexing "No places found" is not damaging, but it wastes
 * the domain's first crawl on an empty page, so indexing is held back until the
 * content is worth finding. One environment variable, flipped once.
 *
 * It outlives that first week. Any future staging or preview deployment carries
 * the same risk of competing with the real site in search results, and this is
 * the switch that stops it.
 *
 * # It fails closed, and that is a real trade
 *
 * Unset means "do not index". That matches how it will actually be used - the
 * variable gets set to `true` once, deliberately, when the directory is ready -
 * but it puts the dangerous failure on the wrong side: forget to set it and the
 * site stays invisible to Google indefinitely, silently, with nothing broken to
 * notice.
 *
 * That is why `indexingWarning()` exists and why the admin dashboard shows it.
 * A guard whose failure mode is invisible needs somewhere visible to complain,
 * or the first sign of trouble is asking why nobody is finding the magazine.
 *
 * Only the exact string `true` enables it. Not `1`, not `yes`, not `TRUE ` with
 * a stray space - anything ambiguous means the person setting it was not sure,
 * and the safe reading of "not sure" is "not yet".
 */
export function isIndexingAllowed(
  value: string | undefined = process.env.NEXT_PUBLIC_ALLOW_INDEX,
): boolean {
  return value?.trim().toLowerCase() === 'true'
}

/**
 * Text for the admin dashboard while indexing is off, or null when it is on.
 *
 * Returned rather than rendered so the copy is testable and lives beside the
 * rule it describes.
 */
export function indexingWarning(
  value: string | undefined = process.env.NEXT_PUBLIC_ALLOW_INDEX,
): string | null {
  if (isIndexingAllowed(value)) return null
  return 'This site is hidden from search engines. Set NEXT_PUBLIC_ALLOW_INDEX to true and redeploy once the directory has content.'
}

/**
 * The same state, for the admin home page, knowing whether the site has
 * launched.
 *
 * While the coming-soon page is up, indexing off is the right answer, not a
 * problem: every address shows the splash, which carries its own noindex, and a
 * sitemap published now would send Google to about fourteen hundred listings
 * that are due to be removed before launch. So before launch it is a quiet note
 * with the one instruction that matters - switch both in the same deploy - and
 * only once the site is public does it become a warning.
 *
 * Null when indexing is on: there is nothing to say, before launch or after.
 */
export function indexingNotice(
  allowIndex: string | undefined = process.env.NEXT_PUBLIC_ALLOW_INDEX,
  comingSoon: boolean,
): { tone: 'info' | 'warn'; title: string; detail: string } | null {
  if (isIndexingAllowed(allowIndex)) return null
  if (comingSoon) {
    return {
      tone: 'info',
      title: 'Hidden from search engines until launch',
      detail:
        'As it should be while the coming-soon page is on. At launch, set NEXT_PUBLIC_ALLOW_INDEX to true in the same deploy that removes COMING_SOON.',
    }
  }
  return {
    tone: 'warn',
    title: 'Not indexed by search engines',
    detail: indexingWarning(allowIndex) ?? '',
  }
}
