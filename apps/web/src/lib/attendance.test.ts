import { describe, expect, it } from 'vitest'
import { attendanceToken, bookingIdFromToken, visitPageUrl } from './attendance'

/**
 * The link in "Did you go?" carries a token signed for one booking. It is the
 * only permission the answer needs, so it must not be possible to answer for a
 * booking by changing the number in somebody's link.
 */
describe('the attendance token', () => {
  it('names the booking it was made for', () => {
    expect(bookingIdFromToken(attendanceToken(123))).toBe(123)
  })

  it('refuses a token whose number was changed', () => {
    const [, mac] = attendanceToken(123).split('.')
    expect(bookingIdFromToken(`124.${mac}`)).toBeNull()
  })

  it('refuses anything that is not one of ours', () => {
    expect(bookingIdFromToken('')).toBeNull()
    expect(bookingIdFromToken('123')).toBeNull()
    expect(bookingIdFromToken('abc.def')).toBeNull()
    expect(bookingIdFromToken('123.short')).toBeNull()
  })
})

describe('the visit page address', () => {
  it('has no prefix in English and the language prefix otherwise', () => {
    const token = attendanceToken(5)
    expect(visitPageUrl(token, 'en', 'came').endsWith(`/visit/${token}?answer=came`)).toBe(true)
    expect(visitPageUrl(token, 'en').includes('/en/')).toBe(false)
    expect(visitPageUrl(token, 'ar').endsWith(`/ar/visit/${token}`)).toBe(true)
  })
})
