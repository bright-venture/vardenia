import { describe, expect, it } from 'vitest'
import {
  CONTACT_FIELDS,
  checkContactValue,
  contactProblemCode,
  normaliseContact,
  validContactValue,
} from './contact'

describe('phone and whatsapp', () => {
  it.each(['+961 70 000 000', '(01) 234-567', '0096170000000', '123456'])('accepts %s', (v) => {
    expect(validContactValue('phone', v)).toBe(true)
    expect(validContactValue('whatsapp', v)).toBe(true)
  })
  it.each(['12345', '1'.repeat(21), 'call me', '+961<script>', '70.000.000'])('refuses %s', (v) => {
    expect(validContactValue('phone', v)).not.toBe(true)
  })
})

describe('email', () => {
  it('accepts an address and refuses junk', () => {
    expect(validContactValue('email', 'info@cafe.com')).toBe(true)
    expect(validContactValue('email', 'nope')).not.toBe(true)
    expect(validContactValue('email', 'a b@c.com')).not.toBe(true)
  })
})

describe('social links', () => {
  it.each([
    ['instagram', 'https://instagram.com/cafe', 'https://instagram.com/cafe'],
    ['instagram', 'https://www.instagram.com/cafe/', 'https://www.instagram.com/cafe/'],
    ['facebook', 'https://fb.com/cafe', 'https://fb.com/cafe'],
    ['facebook', 'https://m.facebook.com/cafe', 'https://m.facebook.com/cafe'],
    ['youtube', 'https://youtu.be/abc', 'https://youtu.be/abc'],
    ['x', 'https://twitter.com/cafe', 'https://twitter.com/cafe'],
    ['linkedin', 'https://www.linkedin.com/company/cafe', 'https://www.linkedin.com/company/cafe'],
    ['tiktok', 'https://tiktok.com/@cafe', 'https://tiktok.com/@cafe'],
    ['snapchat', 'https://snapchat.com/add/cafe', 'https://snapchat.com/add/cafe'],
  ] as const)('keeps a good %s link %s', (kind, v, out) => {
    expect(normaliseContact(kind, v)).toBe(out)
  })

  it.each([
    ['instagram', 'cafe_nour', 'https://instagram.com/cafe_nour'],
    ['instagram', '@cafe.nour', 'https://instagram.com/cafe.nour'],
    ['tiktok', '@cafe', 'https://tiktok.com/@cafe'],
    ['x', '@cafe', 'https://x.com/cafe'],
    ['snapchat', 'cafe', 'https://snapchat.com/add/cafe'],
  ] as const)('turns the %s handle %s into a URL', (kind, v, out) => {
    expect(normaliseContact(kind, v)).toBe(out)
  })

  it('does not take a bare handle for facebook, youtube or linkedin', () => {
    for (const kind of ['facebook', 'youtube', 'linkedin'] as const) {
      expect(validContactValue(kind, 'cafe')).not.toBe(true)
    }
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'http://instagram.com/cafe',
    'https://evil.com/instagram.com',
    'https://instagram.com.evil.com/x',
    'https://evilinstagram.com/x',
    'https://user@evil.com/',
    'ftp://instagram.com/x',
    '//instagram.com/x',
    'bad handle!',
  ])('refuses %s', (v) => {
    expect(validContactValue('instagram', v)).not.toBe(true)
  })

  it('refuses a link on the wrong network', () => {
    expect(validContactValue('facebook', 'https://instagram.com/cafe')).not.toBe(true)
  })

  it('treats blank as absent', () => {
    expect(validContactValue('instagram', '')).toBe(true)
    expect(normaliseContact('instagram', '  ')).toBeUndefined()
  })
})

describe('literal edge cases (fix wave)', () => {
  it('refuses https://instagram.com@evil.com (userinfo trick)', () => {
    expect(validContactValue('instagram', 'https://instagram.com@evil.com')).not.toBe(true)
  })

  it('accepts an uppercase scheme and host, kept as typed', () => {
    expect(validContactValue('instagram', 'HTTPS://WWW.INSTAGRAM.COM/x')).toBe(true)
    expect(normaliseContact('instagram', 'HTTPS://WWW.INSTAGRAM.COM/x')).toBe(
      'HTTPS://WWW.INSTAGRAM.COM/x',
    )
  })

  it('accepts a link with a trailing space, stored trimmed', () => {
    expect(validContactValue('instagram', 'https://instagram.com/cafe ')).toBe(true)
    expect(normaliseContact('instagram', 'https://instagram.com/cafe ')).toBe(
      'https://instagram.com/cafe',
    )
  })

  it('refuses a bare handle with spaces', () => {
    expect(validContactValue('instagram', 'cafe nour')).not.toBe(true)
    expect(validContactValue('x', '@cafe nour')).not.toBe(true)
  })
})

describe('checkContactValue and contactProblemCode', () => {
  it('gives a code with each refusal', () => {
    expect(checkContactValue('phone', 'call me')).toMatchObject({ ok: false, code: 'phone' })
    expect(checkContactValue('whatsapp', '1')).toMatchObject({ ok: false, code: 'phone' })
    expect(checkContactValue('email', 'nope')).toMatchObject({ ok: false, code: 'email' })
    expect(checkContactValue('facebook', 'https://evil.com/x')).toMatchObject({
      ok: false,
      code: 'link',
    })
    expect(checkContactValue('instagram', 'cafe')).toEqual({ ok: true })
    expect(checkContactValue('phone', '')).toEqual({ ok: true })
  })

  it('keeps validContactValue as true or the same message', () => {
    const verdict = checkContactValue('x', 'https://evil.com/x')
    if (verdict.ok) throw new Error('expected a refusal')
    expect(validContactValue('x', 'https://evil.com/x')).toBe(verdict.message)
  })

  it('maps every message it can produce back to its code, exactly', () => {
    for (const field of CONTACT_FIELDS) {
      const bad = field === 'phone' || field === 'whatsapp' ? 'x' : field === 'email' ? 'x' : 'a b'
      const verdict = checkContactValue(field, bad)
      if (verdict.ok) throw new Error(`expected a refusal for ${field}`)
      expect(contactProblemCode(verdict.message)).toBe(verdict.code)
    }
    expect(contactProblemCode('something about https and 6 to 20')).toBeUndefined()
  })
})

describe('CONTACT_FIELDS', () => {
  it('lists every public contact field', () => {
    expect([...CONTACT_FIELDS]).toEqual([
      'phone',
      'whatsapp',
      'email',
      'instagram',
      'facebook',
      'tiktok',
      'snapchat',
      'youtube',
      'x',
      'linkedin',
    ])
  })
})
