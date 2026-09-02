import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Payload } from 'payload'
import { can, tierOf } from '@vardenia/core'
import { isPlaceholder } from '../lib/media'
import { slugifyStem, STEM_LIMIT } from '../hooks/unguessableFilename'

/**
 * Uploads a tree of photograph folders onto the listings they belong to.
 *
 * The other half of photo-folders.ts. That one produces empty folders named
 * after the slug each listing will have; this one reads them back once somebody
 * has dropped photographs in.
 *
 *   photos/
 *     beit-el-qamar/
 *       cover.jpg      -> heroImage
 *       01.jpg         -> gallery, in name order
 *       02.jpg
 *
 * # Why a command rather than a screen in the admin panel
 *
 * The listing import is a screen because a spreadsheet is small enough to post
 * and staff need to run it. A photo set is not: three hundred listings at a few
 * megabytes each is gigabytes, and every upload is re-encoded into six sizes.
 * Pushing that through a browser to a function that is killed at ten seconds is
 * the architecture that made the listing import need windowing in the first
 * place, and here it would buy nothing - the folders arrive on somebody's
 * machine as a zip, and that machine is three times closer to the database than
 * the deployed site is.
 *
 * # Nothing is guessed
 *
 * A folder whose name matches no listing is reported, never fuzzy-matched. A
 * photograph in a format the site cannot process is reported by name. A listing
 * that already has a real photograph is left alone unless `replace` is set,
 * because the common re-run is somebody adding the folders that were missing
 * last time, not replacing what worked.
 */

/**
 * The stem an upload for this listing is stored under, marker and all.
 *
 * `unguessableFilename` slugifies the name it is given and clips it to
 * STEM_LIMIT before appending its randomness. Naming a file `<slug>-cover` and
 * letting that happen loses the `-cover` for any slug long enough to reach the
 * limit, and `-cover` is the only thing that says who uploaded it:
 *
 *   slug      boogie-strike-bowling-billiards-bowling-billiards-darts-games
 *   asked for boogie-strike-bowling-billiards-bowling-billiards-darts-games-cover.jpg
 *   stored as boogie-strike-bowling-billiards-bowling-billiards-darts-game-<hex>.webp
 *
 * So the marker is not the part that gets clipped. The slug is trimmed to leave
 * room for it, which costs a few characters of a name nobody types and keeps
 * the one piece of it that carries meaning.
 *
 * Found because `photos:import --remove` reported 15 of 153 listings as
 * "the photograph was not uploaded by this tool" - which was the check working
 * exactly as written, on evidence that had been destroyed before it got there.
 */
export function uploadStem(slug: string, marker: string): string {
  const room = STEM_LIMIT - marker.length - 1
  const clipped = slugifyStem(slug).slice(0, room).replace(/-+$/g, '')
  return clipped ? `${clipped}-${marker}` : marker
}

/**
 * What the namer produced before it reserved that room.
 *
 * Every photograph imported before this was fixed is stored under this shape,
 * and `isOurUpload` has to keep recognising them or a re-run would treat 153
 * real uploads as somebody else's work. It is still an exact comparison against
 * a value derived from the slug, so it grants nothing it should not: the only
 * filenames it accepts are ones this tool demonstrably wrote.
 */
export function legacyUploadStem(slug: string, marker: string): string {
  return slugifyStem(`${slug}-${marker}`)
}

/** What Media accepts. HEIC is deliberately absent - see the note in Media.ts. */
const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
}

/**
 * Formats a contributor will plausibly send that the site cannot take, with the
 * reason in words. HEIC is the one that matters: it is what an iPhone produces
 * by default, so it will arrive, and "unsupported file" would send somebody
 * looking for a bug rather than changing an export setting.
 */
const REFUSED: Record<string, string> = {
  '.heic':
    'HEIC is what an iPhone shoots by default and the site cannot process it. Export as JPEG.',
  '.heif': 'HEIF cannot be processed. Export as JPEG.',
  '.tif': 'TIFF cannot be processed. Export as JPEG.',
  '.tiff': 'TIFF cannot be processed. Export as JPEG.',
  '.gif': 'GIF is not accepted for listing photography.',
  '.bmp': 'BMP is not accepted. Export as JPEG.',
}

export interface PhotoImportOptions {
  /** The folder holding one directory per listing. */
  root: string
  credit: string
  usageRights: 'owned' | 'licensed' | 'supplied'
  dryRun?: boolean
  /** Stop after this many folders. */
  limit?: number
  /** Overwrite listings that already have a real photograph. */
  replace?: boolean
}

export interface PhotoImportResult {
  folders: number
  updated: number
  uploaded: number
  skippedExisting: { folder: string; reason: string }[]
  unmatched: string[]
  refused: { folder: string; file: string; reason: string }[]
  overflow: { folder: string; kept: number; sent: number }[]
  failures: { folder: string; error: string }[]
}

export interface FolderContents {
  folder: string
  cover: string | null
  gallery: string[]
  refused: { file: string; reason: string }[]
}

/**
 * What one folder holds, sorted and classified.
 *
 * `cover` is matched by stem rather than by position, because "the first file
 * alphabetically" depends on how a file manager happened to sort and the cover
 * is the one photograph that really matters.
 */
export function readFolder(dir: string, entries: string[]): FolderContents {
  const cover: string[] = []
  const gallery: string[] = []
  const refused: { file: string; reason: string }[] = []

  for (const entry of [...entries].sort((a, b) => a.localeCompare(b))) {
    /**
     * The stem is taken with the extension as it was actually written, not the
     * lowercased copy. Passing `.jpg` to basename for a file called COVER.JPG
     * strips nothing, so the stem came out as "cover.jpg", matched no rule, and
     * the cover photograph was silently dropped into the gallery. A camera
     * writing uppercase names is ordinary.
     */
    const rawExtension = path.extname(entry)
    const extension = rawExtension.toLowerCase()
    const stem = path.basename(entry, rawExtension).toLowerCase()

    // The note this tool's other half leaves in every folder.
    if (entry.toLowerCase().endsWith('.txt')) continue

    if (REFUSED[extension]) {
      refused.push({ file: entry, reason: REFUSED[extension] })
      continue
    }

    if (!MIME_BY_EXTENSION[extension]) continue

    if (stem === 'cover') cover.push(entry)
    else gallery.push(entry)
  }

  return {
    folder: path.basename(dir),
    // More than one cover is a mistake worth being deterministic about rather
    // than clever: the first by name wins and the rest become gallery images.
    cover: cover[0] ?? null,
    gallery: [...cover.slice(1), ...gallery],
    refused,
  }
}

/**
 * Whether the listing's current hero is one of the import's placeholders.
 *
 * Re-exported rather than defined here. The rendering side needs the same
 * answer - a page that opens on a full-height photograph has to know when there
 * is not one - and two spellings of "is this the stand-in" is how the site and
 * the photography backlog start disagreeing about which listings still need a
 * photographer. See lib/media.
 */
export { isPlaceholder }

const relationId = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) {
    return (value as { id: string | number }).id
  }
  return null
}

export async function runPhotoImport(
  payload: Payload,
  options: PhotoImportOptions,
): Promise<PhotoImportResult> {
  const result: PhotoImportResult = {
    folders: 0,
    updated: 0,
    uploaded: 0,
    skippedExisting: [],
    unmatched: [],
    refused: [],
    overflow: [],
    failures: [],
  }

  const directories = readdirSync(options.root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

  const wanted = options.limit ? directories.slice(0, options.limit) : directories
  result.folders = wanted.length

  for (const folder of wanted) {
    const dir = path.join(options.root, folder)
    const contents = readFolder(dir, readdirSync(dir))

    for (const entry of contents.refused) {
      result.refused.push({ folder, file: entry.file, reason: entry.reason })
    }

    if (!contents.cover && contents.gallery.length === 0) continue

    const found = await payload.find({
      collection: 'businesses',
      where: { slug: { equals: folder } },
      limit: 1,
      depth: 1,
      draft: true,
      overrideAccess: true,
    })

    const business = found.docs[0]

    if (!business) {
      result.unmatched.push(folder)
      continue
    }

    /**
     * Already has a real photograph, so it is left alone. The usual re-run is
     * somebody adding the folders that were missing last time; silently
     * overwriting the ones that worked would be the opposite of helpful.
     */
    const hero = (business as { heroImage?: unknown }).heroImage
    const heroFilename = (hero as { filename?: unknown } | null)?.filename

    if (hero && !isPlaceholder(heroFilename) && !options.replace) {
      result.skippedExisting.push({ folder, reason: 'already has a photograph' })
      continue
    }

    /**
     * Only as many gallery images as the listing's tier displays. The rest are
     * not uploaded at all: each one costs an encode into six sizes and a place
     * in the bucket, to be hidden at render time by resolveGallery.
     */
    const limit = can(tierOf((business as { tier?: string }).tier ?? 'free'), 'galleryLimit')
    const gallery = contents.gallery.slice(0, limit)

    if (contents.gallery.length > gallery.length) {
      result.overflow.push({ folder, kept: gallery.length, sent: contents.gallery.length })
    }

    if (options.dryRun) {
      result.updated += 1
      result.uploaded += (contents.cover ? 1 : 0) + gallery.length
      continue
    }

    try {
      const name = String((business as { name?: string }).name ?? folder)

      const upload = async (file: string, index: number | null): Promise<number | string> => {
        const data = readFileSync(path.join(dir, file))
        const extension = path.extname(file).toLowerCase()

        const created = await payload.create({
          collection: 'media',
          data: {
            // Required, and it cannot be invented well. The business name is
            // honest, useful to a screen reader, and editable afterwards.
            alt: index === null ? name : `${name}, photograph ${index + 1}`,
            credit: options.credit,
            usageRights: options.usageRights,
          },
          // The stem survives unguessableFilename, so a photograph can be
          // traced back to the listing it was uploaded for. `uploadStem` is
          // what makes that true for a long slug as well as a short one.
          file: {
            data,
            mimetype: MIME_BY_EXTENSION[extension] as string,
            name: `${uploadStem(folder, index === null ? 'cover' : String(index + 1).padStart(2, '0'))}${extension}`,
            size: data.length,
          },
          depth: 0,
          overrideAccess: true,
        })

        result.uploaded += 1
        return created.id
      }

      const heroId = contents.cover ? await upload(contents.cover, null) : relationId(hero)
      const galleryIds: (number | string)[] = []

      for (const [index, file] of gallery.entries()) {
        galleryIds.push(await upload(file, index))
      }

      /**
       * Published listings are updated in place; drafts stay drafts. Passing
       * `draft: true` for a published listing would leave the photograph in an
       * unpublished version and the placeholder still on the site, and omitting
       * it for a draft would publish a listing nobody has reviewed.
       */
      const isDraft = (business as { _status?: string })._status !== 'published'

      await payload.update({
        collection: 'businesses',
        id: business.id,
        data: {
          ...(heroId !== null ? { heroImage: heroId } : {}),
          ...(galleryIds.length > 0 ? { gallery: galleryIds } : {}),
        } as never,
        draft: isDraft,
        depth: 0,
        overrideAccess: true,
      })

      result.updated += 1
    } catch (error) {
      result.failures.push({
        folder,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}

/** Whether the path exists and is a directory, said once rather than at both callers. */
export function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory()
  } catch {
    return false
  }
}
