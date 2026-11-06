import { describe, expect, it } from 'vitest'
import { EDITION_MAX_BYTES, Editions, limitEditionSize } from './Editions'

/** Magazine PDFs alone may be large; the rest of the site keeps its 25 MB. */
const run = (filesize: unknown) =>
  limitEditionSize({ data: { filesize } } as unknown as Parameters<typeof limitEditionSize>[0])

describe('Magazine PDFs', () => {
  it('accepts a full issue up to 200 MB', () => {
    expect(EDITION_MAX_BYTES).toBe(200 * 1024 * 1024)
    expect(() => run(80 * 1024 * 1024)).not.toThrow()
    expect(() => run(EDITION_MAX_BYTES)).not.toThrow()
  })

  it('refuses a larger PDF with a message that says what to do', () => {
    expect(() => run(EDITION_MAX_BYTES + 1)).toThrow(/up to 200 MB/)
  })

  it('takes PDFs and nothing else', () => {
    const upload = Editions.upload as { mimeTypes?: string[] }
    expect(upload.mimeTypes).toEqual(['application/pdf'])
  })
})
