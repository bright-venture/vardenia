import { describe, it, expect } from 'vitest'
import { parseDiscoveryRoute } from './browser-state'
describe('saved discovery routes', () => {
  it('recovers from missing, malformed and non-array browser storage', () => {
    for (const value of [null, 'invalid', '{}', 'true', '"byblos"'])
      expect(parseDiscoveryRoute(value)).toEqual([])
  })
  it('keeps valid destinations in visitor order and discards duplicates or unknown entries', () => {
    expect(parseDiscoveryRoute('["tyre","byblos","tyre","unknown",null,4,"baalbek"]')).toEqual([
      'tyre',
      'byblos',
      'baalbek',
    ])
  })
})
