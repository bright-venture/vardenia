import type { CollectionBeforeDeleteHook } from 'payload'
import { APIError } from 'payload'

/**
 * Stops an image being deleted while a document still requires it.
 *
 * Payload points every upload field at media with `on delete set null`, which is
 * exactly right for the optional ones: delete a logo and the listing simply has
 * no logo. But a required upload field is also `not null` in Postgres, so the
 * two rules contradict each other. The database tries to null the column, the
 * not-null constraint rejects it, and the whole delete fails with
 * "An unknown error has occurred" - no mention of which document is holding on.
 *
 * Checking first turns that into a sentence an editor can act on. Only the
 * required fields are listed here; the optional ones null out cleanly and need
 * no protection.
 */

const REQUIRED_USES = [
  { collection: 'issues', field: 'cover', label: 'cover of' },
  { collection: 'articles', field: 'heroImage', label: 'hero image of' },
  { collection: 'businesses', field: 'heroImage', label: 'hero image of' },
] as const

export const blockMediaInUse: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const { payload } = req

  const blockers: string[] = []

  for (const use of REQUIRED_USES) {
    const result = await payload.find({
      collection: use.collection,
      where: { [use.field]: { equals: id } },
      limit: 5,
      depth: 0,
      overrideAccess: true,
      // Drafts share the main table with published rows, and the constraint
      // lives on that table, so both have to count as a blocker.
      draft: true,
    })

    for (const doc of result.docs) {
      const title = (doc as { title?: string }).title ?? `#${(doc as { id: unknown }).id}`
      blockers.push(`${use.label} "${title}"`)
    }

    if (result.totalDocs > result.docs.length) {
      blockers.push(`and ${result.totalDocs - result.docs.length} more`)
    }
  }

  if (blockers.length === 0) return

  throw new APIError(
    `This image is still in use: ${blockers.join(', ')}. ` +
      'Those fields are required, so point them at a different image before deleting this one.',
    400,
  )
}
