import { describe, expect, it } from 'vitest'
import type { Access, CollectionConfig, Field, FieldAccess } from 'payload'
import { Businesses } from './Businesses'
import { Articles } from './Articles'
import { Issues } from './Issues'
import { Pages } from './Pages'
import { Media } from './Media'
import { Users } from './Users'
import { QrCodes } from './QrCodes'
import { ScanEvents } from './ScanEvents'

/**
 * The access *policy*, as opposed to the access *helpers*.
 *
 * access/index.test.ts proves isStaff and friends answer correctly. It cannot
 * prove a collection wires the right one in the right place, and that is where
 * the damage actually comes from: a field added to the Commercial tab without
 * field-level read access is serialised into every anonymous /api/businesses
 * response, and nothing about the admin UI would look wrong.
 *
 * These read the real exported configs, so they fail when someone changes the
 * policy rather than when someone changes an implementation detail.
 *
 * What this does NOT do is issue a real HTTP request against a running Payload
 * with a database behind it. That is the only way to prove the serialiser
 * honours these settings end to end, and it needs a test database. Until then
 * this asserts the configuration is what we believe it is.
 */

const admin = { id: 1, roles: ['admin'] }
const staff = { id: 2, roles: ['staff'] }

const ctx = (user: unknown, extra: Record<string, unknown> = {}) =>
  ({ req: { user }, ...extra }) as unknown as Parameters<Access>[0]

const fieldCtx = (user: unknown) => ctx(user) as unknown as Parameters<FieldAccess>[0]

const nameOf = (field: Field): string | undefined => ('name' in field ? field.name : undefined)

/** Pull the named tab out of a tabbed collection, or fail loudly. */
function tabFields(config: CollectionConfig, label: string): Field[] {
  for (const field of config.fields) {
    if (field.type !== 'tabs') continue
    const tab = field.tabs.find((candidate) => 'label' in candidate && candidate.label === label)
    if (tab) return tab.fields
  }
  throw new Error(`No "${label}" tab found in ${config.slug}`)
}

function fieldNamed(fields: Field[], name: string): Field {
  const found = fields.find((field) => nameOf(field) === name)
  if (!found) throw new Error(`No field named "${name}"`)
  return found
}

// ---------------------------------------------------------------------------

/**
 * The one that matters most.
 *
 * Anything in this tab is commercial. Two fields are deliberately public - the
 * site renders a tier badge and a verified tick - and everything else must carry
 * field-level read access. Adding a field here without one is the exact mistake
 * this exists to catch, so the allowlist is explicit: a new field fails this
 * test until someone decides, in writing, which side it belongs on.
 */
describe('Businesses: the Commercial tab', () => {
  const PUBLICLY_READABLE = new Set(['tier', 'verified'])

  const fields = tabFields(Businesses, 'Commercial')

  it('has fields to check, so a rename cannot silently empty this suite', () => {
    expect(fields.length).toBeGreaterThanOrEqual(6)
  })

  it.each(fields.map((f) => nameOf(f) ?? '<unnamed>'))(
    '%s is either on the public allowlist or unreadable by the public',
    (name) => {
      if (PUBLICLY_READABLE.has(name)) return

      const field = fieldNamed(fields, name)
      const read = 'access' in field ? field.access?.read : undefined

      expect(read, `${name} is in the Commercial tab with no field-level read rule`).toBeDefined()
      expect(read!(fieldCtx(null))).toBe(false)
      expect(read!(fieldCtx(staff))).toBe(true)
    },
  )

  /**
   * The tab carries `admin.condition`, which hides it in the UI. That is
   * cosmetic: REST and GraphQL keep serialising the fields regardless. If the
   * condition were ever mistaken for the protection, deleting the field-level
   * rules would look harmless.
   */
  it('does not rely on admin.condition to keep contract data private', () => {
    const notes = fieldNamed(fields, 'internalNotes')
    const read = 'access' in notes ? notes.access?.read : undefined

    expect(read).toBeDefined()
    expect(read!(fieldCtx(null))).toBe(false)
  })

  it('lets only an admin change tier and verified', () => {
    for (const name of ['tier', 'verified']) {
      const field = fieldNamed(fields, name)
      const update = 'access' in field ? field.access?.update : undefined

      expect(update, `${name} should be admin-only to update`).toBeDefined()
      expect(update!(fieldCtx(staff))).toBe(false)
      expect(update!(fieldCtx(admin))).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------

describe('collection read access', () => {
  it('hides unpublished listings, articles and pages from the public', () => {
    for (const config of [Businesses, Articles, Pages]) {
      const read = config.access?.read
      expect(read, `${config.slug} has no read rule`).toBeDefined()
      expect(read!(ctx(null)), `${config.slug} should constrain anonymous reads`).toEqual({
        _status: { equals: 'published' },
      })
      expect(read!(ctx(staff))).toBe(true)
    }
  })

  it('keeps media and issues public, which the printed magazine depends on', () => {
    for (const config of [Media, Issues]) {
      expect(config.access?.read!(ctx(null))).toBe(true)
    }
  })

  it('keeps QR codes, scan events and users staff-only', () => {
    for (const config of [QrCodes, ScanEvents, Users]) {
      const read = config.access?.read
      expect(read!(ctx(null)), `${config.slug} must not be publicly readable`).toBe(false)
      expect(read!(ctx(staff))).toBe(true)
    }
  })
})

describe('collection write access', () => {
  it('refuses every anonymous write across every collection', () => {
    const all = [Businesses, Articles, Issues, Pages, Media, Users, QrCodes, ScanEvents]

    for (const config of all) {
      for (const action of ['create', 'update', 'delete'] as const) {
        const rule = config.access?.[action]
        expect(rule, `${config.slug}.${action} has no rule`).toBeDefined()
        expect(rule!(ctx(null, { id: 1 })), `${config.slug}.${action} allowed anonymously`).toBe(
          false,
        )
      }
    }
  })

  it('reserves deleting an issue or a QR code for an admin', () => {
    for (const config of [Issues, QrCodes]) {
      expect(config.access?.delete!(ctx(staff))).toBe(false)
      expect(config.access?.delete!(ctx(admin))).toBe(true)
    }
  })
})

/**
 * Scan counts are the evidence behind a renewal conversation. The app writes
 * them through the local API, which bypasses access control by design; nothing
 * arriving over HTTP should be able to add or edit one, including an admin.
 */
describe('ScanEvents are append-only from the outside', () => {
  it.each([null, staff, admin])('refuses create and update for %o', (user) => {
    expect(ScanEvents.access?.create!(ctx(user))).toBe(false)
    expect(ScanEvents.access?.update!(ctx(user))).toBe(false)
  })

  it('still lets an admin delete, for corrections and test data', () => {
    expect(ScanEvents.access?.delete!(ctx(admin))).toBe(true)
    expect(ScanEvents.access?.delete!(ctx(staff))).toBe(false)
  })
})

/**
 * Nobody promotes themselves. `roles` is the field that decides everything else
 * in this file, so it is admin-only at the field level - a staff user editing
 * their own profile can change their phone number, not their powers.
 */
describe('Users', () => {
  const roles = fieldNamed(Users.fields, 'roles')
  const rolesAccess = 'access' in roles ? roles.access : undefined

  it('lets only an admin grant a role', () => {
    expect(rolesAccess?.update).toBeDefined()
    expect(rolesAccess!.update!(fieldCtx(staff))).toBe(false)
    expect(rolesAccess!.update!(fieldCtx(admin))).toBe(true)
  })

  it('lets only an admin set roles at creation', () => {
    expect(rolesAccess?.create).toBeDefined()
    expect(rolesAccess!.create!(fieldCtx(staff))).toBe(false)
    expect(rolesAccess!.create!(fieldCtx(admin))).toBe(true)
  })

  it('lets a staff user edit their own profile and nobody elses', () => {
    const update = Users.access!.update!

    expect(update(ctx(staff, { id: staff.id }))).toBe(true)
    expect(update(ctx(staff, { id: 999 }))).toBe(false)
    expect(update(ctx(admin, { id: 999 }))).toBe(true)
    expect(update(ctx(null, { id: 999 }))).toBe(false)
  })

  it('has no default role, so an account cannot be created with implicit powers', () => {
    expect('defaultValue' in roles ? roles.defaultValue : undefined).toBeUndefined()
  })
})

/**
 * Print run is how many copies were printed. It is the denominator in scans per
 * thousand copies, and it is commercially sensitive.
 */
describe('Issues', () => {
  it('keeps the print run away from the public API', () => {
    const printRun = fieldNamed(Issues.fields, 'printRun')
    const read = 'access' in printRun ? printRun.access?.read : undefined

    expect(read).toBeDefined()
    expect(read!(fieldCtx(null))).toBe(false)
    expect(read!(fieldCtx(staff))).toBe(true)
  })
})
