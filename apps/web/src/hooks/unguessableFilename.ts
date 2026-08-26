import { randomBytes } from 'node:crypto'
import type { CollectionBeforeOperationHook } from 'payload'

/**
 * Give every upload a name nobody can guess.
 *
 * # What it replaces
 *
 * Payload stores a file under the name it arrived with, sanitised, adding `-1`
 * on a collision. So `contract-final.pdf` uploaded by a member of staff sits at
 * a URL anyone can type. The bucket is public by intent - it serves listing
 * photography to readers - so the only thing standing between a file and the
 * internet is whether the address can be worked out.
 *
 * Today everything in there is meant to be public, which is why this is a
 * hardening measure rather than a fix for a live leak. It stops being that the
 * first time somebody uploads a signed contract or a passport scan to the same
 * collection, and that is not a decision anybody announces.
 *
 * # Why not a bare UUID
 *
 * The checklist asks for one. A file called `9f3a2c1b.webp` is unguessable and
 * also unrecognisable, and these filenames appear in image URLs that search
 * engines read and that a designer has to match against a layout.
 *
 * So: the original stem, slugified and clipped, plus 96 bits of randomness.
 * `beirut-sunset-a3f19c4e2b7d5081.webp` is as unguessable as a UUID - the
 * entropy is in the suffix, and knowing the stem does not help - while staying
 * a filename a person can recognise.
 *
 * # Why beforeOperation
 *
 * The rename has to happen before Payload writes the file anywhere, which is
 * earlier than beforeChange. `req.file` is the parsed upload, and renaming it
 * here means the stored file, the database row and every generated size all
 * agree, because they are all derived from this one value afterwards.
 */

/** 96 bits. Long enough that guessing is not a strategy, short enough to read. */
const SUFFIX_BYTES = 12

/** Lowercase, dashes, no runs, clipped. Empty when there is nothing usable left. */
export function slugifyStem(stem: string): string {
  return stem
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/**
 * Split on the LAST dot only, and keep at most one extension.
 *
 * `archive.tar.gz` becomes stem `archive.tar`, which slugifies to `archive-tar`.
 * That is deliberate: treating `.tar.gz` as the extension would let a crafted
 * name like `x.php.jpg` keep two, and the mime allowlist is not the only thing
 * that should be holding that door.
 */
export function unguessableName(
  original: string,
  random = () => randomBytes(SUFFIX_BYTES),
): string {
  const dot = original.lastIndexOf('.')
  const hasExt = dot > 0 && dot < original.length - 1

  const rawStem = hasExt ? original.slice(0, dot) : original
  const ext = hasExt
    ? original
        .slice(dot + 1)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
    : ''

  const suffix = random().toString('hex')
  const stem = slugifyStem(rawStem)
  const name = stem ? `${stem}-${suffix}` : suffix

  return ext ? `${name}.${ext}` : name
}

export const unguessableFilename: CollectionBeforeOperationHook = ({ req, operation }) => {
  if (operation !== 'create' && operation !== 'update') return
  const file = req.file
  if (!file?.name) return

  file.name = unguessableName(file.name)
}
