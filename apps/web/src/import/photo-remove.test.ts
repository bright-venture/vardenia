import { describe, expect, it } from 'vitest'
import { isOurUpload } from './photo-remove'

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
   */
  it('treats a slug as text rather than as a pattern', () => {
    expect(isOurUpload('anything-cover-9f2a1c7e40b3.webp', 'a.y')).toBe(false)
    expect(isOurUpload('a.y-cover-9f2a1c7e40b3.webp', 'a.y')).toBe(true)
  })
})
