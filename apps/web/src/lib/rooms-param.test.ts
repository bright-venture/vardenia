import { describe, expect, it } from 'vitest'
import { parseRoomsParam } from './booking-price'
import { formatRoomsParam } from './rooms-param'

describe('formatRoomsParam', () => {
  it('is empty with nothing picked', () => {
    expect(formatRoomsParam([])).toBe('')
    expect(formatRoomsParam([{ roomType: 3, option: 'ab', count: 0 }])).toBe('')
  })

  it('joins picks as type:count:option', () => {
    expect(
      formatRoomsParam([
        { roomType: 3, option: 'ab12', count: 2 },
        { roomType: 4, option: 'cd34', count: 1 },
      ]),
    ).toBe('3:2:ab12,4:1:cd34')
  })

  it('round-trips through the server parser', () => {
    const picks = [
      { roomType: 3, option: 'ab12', count: 2 },
      { roomType: 4, option: 'cd34', count: 1 },
    ]
    expect(parseRoomsParam(formatRoomsParam(picks))).toEqual(picks)
  })
})
