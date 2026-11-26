import { describe, expect, it } from 'vitest'
import { normaliseLebanesePhone } from './lebanese-phone'

describe('normaliseLebanesePhone', () => {
  it('makes every way of writing one mobile number equal', () => {
    for (const text of [
      '03 123 456',
      '03123456',
      '+961 3 123 456',
      '00961 3 123 456',
      '961 3 123456',
      '+961-3-123-456',
      ' (03) 123.456 ',
      '3123456',
    ]) {
      expect(normaliseLebanesePhone(text), text).toBe('03123456')
    }
  })

  it('handles eight digit mobiles', () => {
    for (const text of ['70 123 456', '070123456', '+961 70 123 456', '0096170123456']) {
      expect(normaliseLebanesePhone(text), text).toBe('070123456')
    }
    expect(normaliseLebanesePhone('+961 79 300 350')).toBe('079300350')
  })

  it('handles landlines', () => {
    for (const text of ['01 234 567', '+961 1 234 567', '00961 1 234 567', '1234567']) {
      expect(normaliseLebanesePhone(text), text).toBe('01234567')
    }
    expect(normaliseLebanesePhone('09 123 456')).toBe('09123456')
    expect(normaliseLebanesePhone('04 555 666')).toBe('04555666')
  })

  it('refuses what is not a Lebanese number', () => {
    for (const text of [
      '',
      '   ',
      'abc',
      '03 12',
      '03 123 456 789',
      '+44 20 7946 0958',
      '+1 415 555 2671',
      '02 123 456',
      '03a123456',
      null,
      undefined,
      42,
    ]) {
      expect(normaliseLebanesePhone(text), String(text)).toBeNull()
    }
  })
})
