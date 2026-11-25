/** The preview fixtures carry an explicit QA label and a numbered run suffix in the slug. */
export function isReviewListing(listing: { name?: string | null; slug?: string | null }): boolean {
  return /^QA\s/.test(listing.name ?? '') && /^qa-.+-\d+$/.test(listing.slug ?? '')
}
