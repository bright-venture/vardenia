import { describe, expect, it } from 'vitest'
import { can, tierOf } from '@vardenia/core'
import { isPlaceholder, readFolder } from './photo-import'

/**
 * Reading one folder of photographs.
 *
 * The upload itself is covered by a gate that runs against a real database,
 * because whether Payload accepts a file is not a question a fake can answer.
 * What is worth asserting here is the classification: which file becomes the
 * hero, which become the gallery, and which are refused before anybody waits
 * for an upload that was never going to work.
 */

describe('picking the cover out of a folder', () => {
  it('takes cover by name rather than by position', () => {
    const contents = readFolder('photos/blue-table', ['02.jpg', 'cover.jpg', '01.jpg'])

    expect(contents.cover).toBe('cover.jpg')
    expect(contents.gallery).toEqual(['01.jpg', '02.jpg'])
  })

  /**
   * "The first file alphabetically" would make the cover depend on how a file
   * manager happened to sort, and the cover is the one photograph that really
   * matters - it is what a reader sees after scanning a printed code.
   */
  it('does not fall back to the first file when there is no cover', () => {
    const contents = readFolder('photos/blue-table', ['01.jpg', '02.jpg'])

    expect(contents.cover).toBeNull()
    expect(contents.gallery).toEqual(['01.jpg', '02.jpg'])
  })

  it('keeps the gallery in name order, not filesystem order', () => {
    const contents = readFolder('photos/x', ['10.jpg', '02.jpg', '01.jpg', 'cover.jpg'])
    expect(contents.gallery).toEqual(['01.jpg', '02.jpg', '10.jpg'])
  })

  /** Deterministic rather than clever: the first wins, the rest are gallery. */
  it('handles two covers without dropping either', () => {
    const contents = readFolder('photos/x', ['cover.jpg', 'cover.png'])

    expect(contents.cover).toBe('cover.jpg')
    expect(contents.gallery).toEqual(['cover.png'])
  })

  /**
   * A camera writing uppercase names is ordinary, and the first version lost
   * the cover photograph to it: the stem was taken using a lowercased
   * extension, so nothing was stripped from COVER.JPG and it matched no rule.
   */
  it('is not confused by capitals', () => {
    const contents = readFolder('photos/x', ['COVER.JPG'])

    expect(contents.cover).toBe('COVER.JPG')
    expect(contents.gallery).toEqual([])
  })

  it('takes uppercase gallery files too', () => {
    const contents = readFolder('photos/x', ['COVER.JPG', 'IMG_01.JPEG', 'IMG_02.PNG'])

    expect(contents.cover).toBe('COVER.JPG')
    expect(contents.gallery).toEqual(['IMG_01.JPEG', 'IMG_02.PNG'])
  })

  /** The note photos:folders leaves in every folder. */
  it('ignores the instructions file it put there itself', () => {
    const contents = readFolder('photos/x', ['PUT PHOTOS HERE.txt', 'credit.txt', 'cover.jpg'])

    expect(contents.cover).toBe('cover.jpg')
    expect(contents.gallery).toEqual([])
    expect(contents.refused).toEqual([])
  })
})

describe('files the site cannot process', () => {
  /**
   * The one that will actually happen. An iPhone shoots HEIC by default and
   * Media.ts does not list it, so a contributor photographing on a phone sends
   * a folder of files that cannot be used. Saying "unsupported file" would send
   * somebody hunting for a bug rather than changing an export setting.
   */
  it('names HEIC and says what to do about it', () => {
    const contents = readFolder('photos/x', ['cover.heic'])

    expect(contents.cover).toBeNull()
    expect(contents.refused).toHaveLength(1)
    expect(contents.refused[0]?.reason).toMatch(/iPhone/)
    expect(contents.refused[0]?.reason).toMatch(/JPEG/)
  })

  it('reports the other formats somebody plausibly sends', () => {
    const contents = readFolder('photos/x', ['a.tiff', 'b.gif', 'c.bmp', 'd.heif'])

    expect(contents.refused.map((r) => r.file).sort()).toEqual([
      'a.tiff',
      'b.gif',
      'c.bmp',
      'd.heif',
    ])
    expect(contents.gallery).toEqual([])
  })

  /** Everything Media does accept, so the allowlist has not drifted. */
  it('accepts every format the collection allows', () => {
    const contents = readFolder('photos/x', ['01.jpg', '02.jpeg', '03.png', '04.webp', '05.avif'])

    expect(contents.gallery).toHaveLength(5)
    expect(contents.refused).toEqual([])
  })

  /** Anything unrecognised is passed over silently rather than refused loudly. */
  it('says nothing about files that are not photographs at all', () => {
    const contents = readFolder('photos/x', ['.DS_Store', 'notes.docx', 'cover.jpg'])

    expect(contents.cover).toBe('cover.jpg')
    expect(contents.refused).toEqual([])
  })
})

describe('recognising the placeholder', () => {
  /**
   * How the tool knows a listing has no real photograph. The name is the stored
   * one, which unguessableFilename has already randomised - so this has to
   * match on the stem, for the same reason import/run.ts does.
   */
  it('recognises a stored placeholder by its stem', () => {
    expect(isPlaceholder('import-placeholder-a3f19c4e2b7d5081cf20b114.webp')).toBe(true)
  })

  it('does not mistake a real photograph for one', () => {
    expect(isPlaceholder('blue-table-cover-9f2a1c7e40b3.webp')).toBe(false)
    expect(isPlaceholder(null)).toBe(false)
    expect(isPlaceholder(undefined)).toBe(false)
    expect(isPlaceholder(42)).toBe(false)
  })
})

describe('how many gallery photographs a tier displays', () => {
  /**
   * The cap the uploader applies. Read from the same place the listing page
   * reads it, so the number uploaded and the number shown cannot drift apart -
   * uploading an image nobody will ever see costs an encode into six sizes and
   * a place in the bucket.
   */
  it('is one for free, which is every listing today', () => {
    expect(can(tierOf('free'), 'galleryLimit')).toBe(1)
  })

  /**
   * The tiers are free, listed, featured and partner. An earlier version of
   * this test said "premium", which is not one - `tierOf` fell back to free and
   * the assertion passed a 1 off as a real limit. A test that invents the
   * vocabulary it is checking proves nothing about the vocabulary.
   */
  it('rises with the tier', () => {
    const limits = (['free', 'listed', 'featured', 'partner'] as const).map((tier) =>
      can(tierOf(tier), 'galleryLimit'),
    )

    expect(limits).toEqual([1, 6, 15, 40])
    expect(limits).toEqual([...limits].sort((a, b) => a - b))
  })

  /** An unknown tier must not become an unlimited one. */
  it('treats an unrecognised tier as the smallest', () => {
    expect(can(tierOf('nonsense-tier'), 'galleryLimit')).toBe(1)
  })
})
