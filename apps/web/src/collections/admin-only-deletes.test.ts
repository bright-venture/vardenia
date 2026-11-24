import { describe, expect, it } from 'vitest'
import { isAdmin } from '../access/index'
import { Articles } from './Articles'
import { Media } from './Media'

/**
 * Permanent deletes with no trash are admin only (20 November 2026, auth audit
 * step 6). Articles, photos and areas show on the public site, and staff could
 * delete them for good with one click.
 */
describe('deletes that cannot be undone', () => {
  it.each([
    ['articles', Articles],
    ['media', Media],
  ])('%s: only an admin can delete', (_, collection) => {
    expect(collection.access?.delete).toBe(isAdmin)
  })

  const req = (roles: string[]) => ({ req: { user: { collection: 'users', roles } } }) as never
  it('refuses staff and allows an admin', () => {
    expect(isAdmin(req(['staff']))).toBe(false)
    expect(isAdmin(req(['admin']))).toBe(true)
  })
})
