import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCALES } from '@vardenia/i18n'
import { Businesses } from '../collections/Businesses'
import {
  listingPaths,
  revalidateListingsAfterChange,
  revalidateListingsAfterDelete,
} from './revalidateListings'

const { revalidateTag, revalidatePath } = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidateTag, revalidatePath }))

beforeEach(() => {
  revalidateTag.mockReset()
  revalidatePath.mockReset()
})

const tags = () => revalidateTag.mock.calls.map(([tag]) => tag)
const paths = () => revalidatePath.mock.calls.map(([path]) => path)

describe('listing cache invalidation', () => {
  it('stays registered on the listings collection', () => {
    expect(Businesses.hooks?.afterChange).toContain(revalidateListingsAfterChange)
    expect(Businesses.hooks?.afterDelete).toContain(revalidateListingsAfterDelete)
  })

  it('names the bare English address and every language prefix, once per slug', () => {
    const result = listingPaths(['watar', 'watar', null, undefined, ''])
    expect(result).toEqual([
      '/directory/watar',
      ...LOCALES.map((locale) => `/${locale}/directory/watar`),
    ])
  })

  it('rebuilds a listing page whose title changed, and leaves QR destinations alone', async () => {
    const doc = { id: 1, slug: 'rashfet-bon', name: 'Rashfet Bann', _status: 'published' }
    const previousDoc = { ...doc, name: 'Rashfet Bon' }
    expect(await revalidateListingsAfterChange({ doc, previousDoc } as never)).toBe(doc)
    expect(paths()).toContain('/directory/rashfet-bon')
    expect(paths()).toContain('/ar/directory/rashfet-bon')
    expect(tags()).toEqual(['businesses'])
  })

  it('rebuilds both addresses and clears QR destinations when the slug changes', async () => {
    const doc = { id: 1, slug: 'rashfet-bann', _status: 'published' }
    const previousDoc = { ...doc, slug: 'rashfet-bon' }
    await revalidateListingsAfterChange({ doc, previousDoc } as never)
    expect(paths()).toContain('/directory/rashfet-bann')
    expect(paths()).toContain('/directory/rashfet-bon')
    expect(tags()).toContain('qr-codes')
    expect(revalidateTag).toHaveBeenCalledWith('qr-codes', { expire: 0 })
  })

  it('clears QR destinations when a listing is published or unpublished', async () => {
    const doc = { id: 1, slug: 'watar', _status: 'draft' }
    await revalidateListingsAfterChange({
      doc,
      previousDoc: { ...doc, _status: 'published' },
    } as never)
    expect(tags()).toContain('qr-codes')
  })

  it('clears the deleted listing page and QR destinations', async () => {
    const doc = { id: 1, slug: 'watar' }
    expect(await revalidateListingsAfterDelete({ doc } as never)).toBe(doc)
    expect(paths()).toContain('/directory/watar')
    expect(tags()).toEqual(['businesses', 'qr-codes'])
  })

  it('does not fail a save outside the Next request runtime', async () => {
    revalidateTag.mockImplementation(() => {
      throw new Error('Test: no Next request cache')
    })
    revalidatePath.mockImplementation(() => {
      throw new Error('Test: no Next request cache')
    })
    const doc = { id: 1, slug: 'new', _status: 'published' }
    await expect(
      revalidateListingsAfterChange({ doc, previousDoc: { slug: 'old' } } as never),
    ).resolves.toBe(doc)
    await expect(revalidateListingsAfterDelete({ doc } as never)).resolves.toBe(doc)
  })
})
