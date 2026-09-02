import { readdirSync } from 'node:fs'
import path from 'node:path'
import type { Payload } from 'payload'
import { placeholderId } from './run'
import { isDirectory, isPlaceholder, legacyUploadStem, uploadStem } from './photo-import'

/**
 * Takes back a photo import: the placeholder returns and the files go.
 *
 * The opposite of photo-import.ts, and it takes the same argument - point it at
 * the folder tree you uploaded and it undoes exactly that. A batch field on
 * media would have been the other way to scope this, and it would have needed a
 * migration to express something the folder tree already says.
 *
 * # What it will not touch, which is the whole design
 *
 * A photograph is only removed when this tool can prove it uploaded it. The
 * proof is the stored filename: uploads are named `<slug>-cover` and
 * `<slug>-01`, and `unguessableFilename` keeps that stem when it appends its
 * randomness. Anything else - a photograph an editor uploaded through the admin
 * panel, an image shared with an article, the placeholder itself - is left
 * alone and reported.
 *
 * That matters because the failure this guards against is not "the wrong photo
 * came back". It is somebody running a teardown and quietly losing the one
 * photograph a business actually supplied.
 *
 * # Order
 *
 * The listing is repointed at the placeholder first, then the files are
 * deleted. `blockMediaInUse` refuses to delete an image a required field still
 * points at - correctly - so deleting first would simply fail, and on a
 * collection where `heroImage` is required there is no state in between.
 */

export interface PhotoRemoveOptions {
  /** The folder tree that was uploaded, or a single listing slug. */
  target: string
  dryRun?: boolean
}

export interface PhotoRemoveResult {
  slugs: number
  listings: number
  deleted: number
  /** Listings whose photograph this tool did not upload, so did not remove. */
  notOurs: { slug: string; filename: string }[]
  unmatched: string[]
  /** Images the database refused to delete, with the reason it gave. */
  refused: { slug: string; error: string }[]
}

/**
 * Every marker the importer uses: the hero, then the gallery in order.
 *
 * Built once. `isOurUpload` compares a filename against the stem each of these
 * would produce for a given slug, which is the only way to recognise an upload
 * whose marker was clipped away before this was fixed - there is nothing left in
 * the name to read it off.
 *
 * Ninety-nine is generous. The importer pads to two digits, so a hundredth
 * gallery image would be `100` and fall outside this; a listing with a hundred
 * photographs is not a case worth carrying complexity for, and the consequence
 * is one file left behind rather than one wrongly deleted.
 */
const MARKERS: readonly string[] = [
  'cover',
  ...Array.from({ length: 99 }, (_, index) => String(index + 1).padStart(2, '0')),
]

/**
 * Whether this filename is one the photo importer wrote for this listing.
 *
 * Deliberately strict, and unchanged in what it grants. `blue-table-cover-9f2a.webp`
 * and `blue-table-01-7c3d.webp` match for `blue-table`; a photograph called
 * `blue-table-terrace.jpg` that somebody uploaded by hand does not, and neither
 * does anything belonging to a listing whose slug merely starts the same way -
 * `blue-table-2-cover-...` belongs to `blue-table-2`, not to `blue-table`.
 *
 * # Why it is a comparison now rather than a pattern
 *
 * The pattern was `^<slug>-(cover|\d{2})-<hex>\.`, which is correct for every
 * name the importer can produce today and was wrong for the names it produced
 * before `uploadStem` existed. A slug long enough to reach STEM_LIMIT had its
 * marker clipped off, so the filename carried no evidence of who wrote it and
 * `--remove` reported the listing as somebody else's work - 15 of 153 on the
 * first real run.
 *
 * Those files are in production and cannot be renamed, so the check has to
 * recognise both shapes. Both are exact comparisons against a stem derived from
 * the slug, so the strictness is intact: a name is accepted only if this tool
 * would have written exactly that name for exactly this listing.
 *
 * # What it cannot tell apart, and why that is safe here
 *
 * Two slugs agreeing for their first fifty-odd characters produce the same
 * stem, because past the clip there is nothing left in the name to separate
 * them. That is a property of the filename, not a looseness in this check.
 *
 * It is contained by where this is used. `runPhotoRemove` finds the business by
 * its exact slug and then inspects that listing's own hero and gallery, so the
 * image is already known to belong to this listing before the question is
 * asked. All this decides is whether the tool wrote it or a person did.
 *
 * Do not reuse it to attribute a loose file to a listing. For that it is wrong.
 */
export function isOurUpload(filename: unknown, slug: string): boolean {
  if (typeof filename !== 'string' || !slug) return false

  // `<stem>-<hex>.<ext>`, which is what unguessableFilename produces. A name
  // with no random suffix was not written by an upload at all.
  const parsed = /^(.+)-([0-9a-f]{8,})\.[a-z0-9]+$/i.exec(filename)
  if (!parsed) return false

  const stem = parsed[1] as string

  return MARKERS.some(
    (marker) => stem === uploadStem(slug, marker) || stem === legacyUploadStem(slug, marker),
  )
}

const relationId = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) {
    return (value as { id: string | number }).id
  }
  return null
}

const filenameOf = (value: unknown): string =>
  value && typeof value === 'object' && 'filename' in value
    ? String((value as { filename?: unknown }).filename ?? '')
    : ''

/** The slugs a target names: every subdirectory, or the one slug given. */
export function slugsFrom(target: string): string[] {
  if (!isDirectory(target)) return [path.basename(target)]

  return readdirSync(target, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

export async function runPhotoRemove(
  payload: Payload,
  options: PhotoRemoveOptions,
): Promise<PhotoRemoveResult> {
  const slugs = slugsFrom(path.resolve(options.target))

  const result: PhotoRemoveResult = {
    slugs: slugs.length,
    listings: 0,
    deleted: 0,
    notOurs: [],
    unmatched: [],
    refused: [],
  }

  // Looked up once. Every listing goes back to the same image, which is what
  // the import intended in the first place.
  const placeholder = options.dryRun ? null : await placeholderId(payload)

  for (const slug of slugs) {
    const found = await payload.find({
      collection: 'businesses',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 1,
      draft: true,
      overrideAccess: true,
    })

    const business = found.docs[0]

    if (!business) {
      result.unmatched.push(slug)
      continue
    }

    const hero = (business as { heroImage?: unknown }).heroImage
    const gallery = ((business as { gallery?: unknown[] }).gallery ?? []) as unknown[]

    const heroName = filenameOf(hero)
    const heroIsOurs = isOurUpload(heroName, slug)

    /**
     * A hero that is neither ours nor the placeholder is somebody's real work.
     * Reported rather than removed, and the gallery is left with it: taking
     * half a listing's photography away is worse than taking none.
     */
    if (hero && !heroIsOurs && !isPlaceholder(heroName)) {
      result.notOurs.push({ slug, filename: heroName })
      continue
    }

    const doomed: (string | number)[] = []
    if (heroIsOurs) {
      const id = relationId(hero)
      if (id !== null) doomed.push(id)
    }

    for (const image of gallery) {
      if (!isOurUpload(filenameOf(image), slug)) continue
      const id = relationId(image)
      if (id !== null) doomed.push(id)
    }

    if (doomed.length === 0) continue

    result.listings += 1

    if (options.dryRun) {
      result.deleted += doomed.length
      continue
    }

    try {
      const keptGallery = gallery
        .filter((image) => !isOurUpload(filenameOf(image), slug))
        .map((image) => relationId(image))
        .filter((id): id is string | number => id !== null)

      const isDraft = (business as { _status?: string })._status !== 'published'

      // Repoint first. heroImage is required, so there is no moment where the
      // listing points at nothing, and blockMediaInUse would refuse otherwise.
      await payload.update({
        collection: 'businesses',
        id: business.id,
        data: {
          ...(heroIsOurs ? { heroImage: placeholder } : {}),
          gallery: keptGallery,
        } as never,
        draft: isDraft,
        depth: 0,
        overrideAccess: true,
      })

      for (const id of doomed) {
        try {
          await payload.delete({ collection: 'media', id, overrideAccess: true })
          result.deleted += 1
        } catch (error) {
          // Usually blockMediaInUse: the image is a hero somewhere else too.
          // The listing has already let go of it, so this is a leftover file
          // rather than a broken listing.
          result.refused.push({
            slug,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    } catch (error) {
      result.refused.push({
        slug,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}
