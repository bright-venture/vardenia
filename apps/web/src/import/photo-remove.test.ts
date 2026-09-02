import { describe, expect, it } from 'vitest'
import { isOurUpload } from './photo-remove'
import { uploadStem } from './photo-import'

/**
 * Which photographs removal is allowed to touch.
 *
 * This one predicate is the whole safety design. Removal deletes files, and the
 * failure it has to prevent is not "the wrong photograph came back" - it is
 * somebody running a teardown and quietly losing the one photograph a business
 * actually supplied. Everything else in photo-remove.ts is bookkeeping around
 * the answer this gives.
 *
 * The proof of ownership is the stored filename. Uploads are named
 * `<slug>-cover` and `<slug>-01`, and unguessableFilename keeps that stem when
 * it appends its randomness, so a name that matches the pattern can only have
 * come from this tool.
 */

describe('photographs this tool uploaded', () => {
  it('recognises a cover it wrote', () => {
    expect(isOurUpload('blue-table-cover-9f2a1c7e40b3d581.webp', 'blue-table')).toBe(true)
  })

  it('recognises the numbered gallery images it wrote', () => {
    for (const n of ['01', '02', '15', '40']) {
      expect(isOurUpload(`blue-table-${n}-9f2a1c7e40b3d581.webp`, 'blue-table'), n).toBe(true)
    }
  })

  it('does not care what the extension became', () => {
    for (const ext of ['webp', 'jpg', 'png', 'avif']) {
      expect(isOurUpload(`blue-table-cover-9f2a1c7e40b3.${ext}`, 'blue-table'), ext).toBe(true)
    }
  })
})

describe('photographs it must never delete', () => {
  /**
   * The one that matters. An editor uploading `blue-table-terrace.jpg` through
   * the admin panel gets a name with the same prefix, and deleting it because
   * the prefix matched would destroy real work.
   */
  it('leaves a hand-uploaded photograph alone, even with the same prefix', () => {
    expect(isOurUpload('blue-table-terrace-9f2a1c7e40b3.webp', 'blue-table')).toBe(false)
    expect(isOurUpload('blue-table-at-sunset-7c3d0a1e.webp', 'blue-table')).toBe(false)
  })

  /**
   * `blue-table-2` is a real listing - the importer mints that suffix whenever
   * two businesses share a name, and four such slugs are already live. Its
   * cover must not be collected while removing photographs for `blue-table`.
   */
  it('does not reach into a listing whose slug merely starts the same', () => {
    expect(isOurUpload('blue-table-2-cover-9f2a1c7e40b3.webp', 'blue-table')).toBe(false)
    expect(isOurUpload('blue-table-2-01-9f2a1c7e40b3.webp', 'blue-table')).toBe(false)
  })

  it('claims that same file correctly for the listing it does belong to', () => {
    expect(isOurUpload('blue-table-2-cover-9f2a1c7e40b3.webp', 'blue-table-2')).toBe(true)
  })

  it('never claims the shared placeholder', () => {
    expect(isOurUpload('import-placeholder-a3f19c4e2b7d5081cf20b114.webp', 'blue-table')).toBe(
      false,
    )
    expect(
      isOurUpload('import-placeholder-a3f19c4e2b7d5081cf20b114.webp', 'import-placeholder'),
    ).toBe(false)
  })

  it('refuses a name with no random suffix, which this tool always adds', () => {
    expect(isOurUpload('blue-table-cover.webp', 'blue-table')).toBe(false)
    expect(isOurUpload('blue-table-01.jpg', 'blue-table')).toBe(false)
  })

  it('refuses anything that is not a string', () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(isOurUpload(value, 'blue-table'), String(value)).toBe(false)
    }
  })

  /**
   * A slug is lowercase letters, digits and dashes, so this cannot happen from
   * the importer - but a hand-edited slug reaching a regexp unescaped would be
   * a quiet way to match far more than intended.
   *
   * The second assertion changed when this stopped building a pattern from the
   * slug. It used to expect `a.y-cover-<hex>`, which no upload can ever produce:
   * `unguessableFilename` slugifies the name it is given, so the file for a slug
   * of `a.y` is stored as `a-y-cover-<hex>`. The check now compares against what
   * the namer actually writes, so the case it describes is the real one.
   */
  it('treats a slug as text rather than as a pattern', () => {
    expect(isOurUpload('anything-cover-9f2a1c7e40b3.webp', 'a.y')).toBe(false)
    expect(isOurUpload('a-y-cover-9f2a1c7e40b3.webp', 'a.y')).toBe(true)
  })
})

/**
 * The bug that made this tool report 15 of 153 real uploads as somebody else's
 * work, on the first run that mattered.
 *
 * `unguessableFilename` clips a stem to STEM_LIMIT before appending randomness.
 * The importer asked for `<slug>-cover`, so for a slug long enough to reach that
 * limit the `-cover` was clipped off - and `-cover` is the only thing in the
 * name that says who wrote it.
 *
 * Both shapes have to be recognised: the new one, and the one already sitting in
 * production against 153 listings.
 */
describe('a slug long enough to lose its marker', () => {
  /** Verbatim from production, and one character past the sixty-char limit. */
  const LONG = 'boogie-strike-bowling-billiards-bowling-billiards-darts-games'

  it('is long enough to trigger it', () => {
    expect(LONG.length).toBeGreaterThan(60)
  })

  /** What the importer wrote before the fix, and what production still holds. */
  it('recognises the historical name, whose marker was clipped away', () => {
    const stored =
      'boogie-strike-bowling-billiards-bowling-billiards-darts-game-7fee93e4bb20d0f559dacb5e.webp'
    expect(isOurUpload(stored, LONG)).toBe(true)
  })

  /** What it writes now: the slug gives up room so the marker survives. */
  it('recognises the new name, whose marker is kept', () => {
    expect(isOurUpload(`${uploadStem(LONG, 'cover')}-7fee93e4bb20d0f559dacb5e.webp`, LONG)).toBe(
      true,
    )
    expect(isOurUpload(`${uploadStem(LONG, '01')}-7fee93e4bb20d0f559dacb5e.webp`, LONG)).toBe(true)
  })

  it('keeps the marker rather than the tail of the slug', () => {
    expect(uploadStem(LONG, 'cover').endsWith('-cover')).toBe(true)
    expect(uploadStem(LONG, '01').endsWith('-01')).toBe(true)
    expect(uploadStem(LONG, 'cover').length).toBeLessThanOrEqual(60)
  })

  /** A short slug is untouched by any of this. */
  it('leaves a short slug exactly as it was', () => {
    expect(uploadStem('blue-table', 'cover')).toBe('blue-table-cover')
    expect(uploadStem('blue-table', '01')).toBe('blue-table-01')
  })

  /**
   * Two slugs that agree for their first fifty-odd characters produce the same
   * stem, and this pins that rather than pretending otherwise. It is a real
   * consequence of clipping: past the limit there is nothing left in the name to
   * tell them apart, and no amount of care in this function invents it.
   *
   * What contains it is that `isOurUpload` never decides which listing an image
   * belongs to. `runPhotoRemove` looks the business up by its exact slug and
   * then inspects that listing's own hero and gallery, so the image is already
   * known to be this listing's. The only question left is the one asked here:
   * did this tool upload it, or did a person. A tie between two slugs cannot
   * reach across from one listing to the other.
   *
   * It would matter if this were ever used to attribute a loose file to a
   * listing. Do not use it for that.
   */
  it('cannot tell two slugs apart past the clip, which is contained elsewhere', () => {
    const twin = `${LONG.slice(0, 55)}-annexe`

    expect(uploadStem(twin, 'cover')).toBe(uploadStem(LONG, 'cover'))
    expect(twin).not.toBe(LONG)
  })

  /**
   * The distinction that does still hold, and the one the original test was
   * protecting: a short slug cannot claim a longer one that starts the same way.
   * Nothing here is clipped, so the full slug is still in the name.
   */
  it('still refuses a slug that merely starts the same way', () => {
    const stored = `${uploadStem('blue-table-2', 'cover')}-9f2a1c7e40b3d581.webp`

    expect(isOurUpload(stored, 'blue-table-2')).toBe(true)
    expect(isOurUpload(stored, 'blue-table')).toBe(false)
  })
})
