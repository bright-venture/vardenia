import { describe, expect, it } from 'vitest'
import { whatsappNumber } from './WhatsAppButton'

/** The number as wa.me wants it: digits only, country code first. */
describe('whatsappNumber', () => {
  it.each([
    ['+961 3 123 456', '9613123456'],
    ['961-3-123-456', '9613123456'],
    ['00961 3 123 456', '9613123456'],
    ['96171123456', '96171123456'],
  ])('reads %s', (raw, digits) => {
    expect(whatsappNumber(raw)).toBe(digits)
  })

  it.each([undefined, '', 'call us', '123'])('hides the button for %s', (raw) => {
    expect(whatsappNumber(raw)).toBeNull()
  })
})
