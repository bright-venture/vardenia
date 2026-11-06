import { describe, expect, it } from 'vitest'
import { PHOTO_MAX_BYTES, limitUploadSize } from './limitUploadSize'

/**
 * Photos keep their 25 MB now that the site-wide upload limit is the magazine
 * PDFs' 200 MB.
 */
const hook = limitUploadSize(PHOTO_MAX_BYTES, 'Photos')
const run = (size: number | undefined, operation = 'create') =>
  hook({ req: { file: size === undefined ? undefined : { size } }, operation } as never)

describe('a per-collection upload limit', () => {
  it('lets a photo up to 25 MB through', () => {
    expect(() => run(4 * 1024 * 1024)).not.toThrow()
    expect(() => run(PHOTO_MAX_BYTES)).not.toThrow()
  })

  it('refuses a larger one, saying the limit', () => {
    expect(() => run(PHOTO_MAX_BYTES + 1)).toThrow(/Photos can be up to 25 MB/)
    expect(() => run(PHOTO_MAX_BYTES + 1, 'update')).toThrow()
  })

  it('ignores saves without a file, and reads', () => {
    expect(() => run(undefined)).not.toThrow()
    expect(() => run(PHOTO_MAX_BYTES * 4, 'read')).not.toThrow()
  })
})
