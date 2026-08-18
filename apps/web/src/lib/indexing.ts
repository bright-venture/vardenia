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
