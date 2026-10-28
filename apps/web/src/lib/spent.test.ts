import { describe, expect, it } from 'vitest'
import { readSpent } from './spent'

describe("the guest's rough amount", () => {
  it('reads what people type', () => {
    expect(readSpent('120')).toBe(120)
    expect(readSpent(' 120.50 ')).toBe(120.5)
    expect(readSpent('1,200')).toBe(1200)
    expect(readSpent('$80')).toBe(80)
  })

  it('treats anything else as no answer', () => {
    for (const raw of ['', null, 'about 50', '0', '-20', '12.345', '9999999']) {
      expect(readSpent(raw), String(raw)).toBeNull()
    }
  })
})
