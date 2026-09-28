import { describe, expect, it } from 'vitest'
import { Businesses, validTime } from './Businesses'

/**
 * The listing form offers only what fits: a category's own subcategories, a
 * governorate's own districts, and opening times the "Open now" filter can
 * read. Each used to be a note in a description asking staff to get it right.
 */

type Loose = {
  name?: string
  fields?: Loose[]
  tabs?: { fields: Loose[] }[]
  filterOptions?: (args: { options: { label: string; value: string }[]; data: object }) => {
    value: string
  }[]
  validate?: (value: unknown, args: { data: object }) => true | string
}

const all = (fields: Loose[]): Loose[] =>
  fields.flatMap((f) => [
    f,
    ...(f.fields ? all(f.fields) : []),
    ...(f.tabs ? f.tabs.flatMap((tab) => all(tab.fields)) : []),
  ])
const field = (name: string) =>
  all(Businesses.fields as unknown as Loose[]).find((f) => f.name === name)!

const optionsOf = (name: string) =>
  (field(name) as unknown as { options: { label: string; value: string }[] }).options

describe('subcategories', () => {
  const sub = field('subcategories')

  it('offers only the chosen category’s subcategories', () => {
    const offered = sub.filterOptions!({
      options: optionsOf('subcategories'),
      data: { category: 'hospitality' },
    }).map((o) => o.value)
    expect(offered).toContain('guest-houses')
    expect(offered).not.toContain('restaurants')
  })

  it('refuses one from another category, and names it', () => {
    expect(sub.validate!(['guest-houses'], { data: { category: 'hospitality' } })).toBe(true)
    expect(sub.validate!(['restaurants'], { data: { category: 'hospitality' } })).toContain(
      'restaurants',
    )
    expect(sub.validate!([], { data: { category: 'hospitality' } })).toBe(true)
  })
})

describe('district', () => {
  const district = field('district')

  it('offers only the chosen governorate’s districts', () => {
    const offered = district.filterOptions!({
      options: optionsOf('district'),
      data: { governorate: 'beqaa' },
    }).map((o) => o.value)
    expect(offered.sort()).toEqual(['rachaya', 'western-beqaa', 'zahle'])
  })

  it('refuses a district from another governorate', () => {
    expect(district.validate!('zahle', { data: { governorate: 'beqaa' } })).toBe(true)
    expect(district.validate!('baalbek', { data: { governorate: 'beqaa' } })).not.toBe(true)
    expect(district.validate!(null, { data: { governorate: 'beqaa' } })).toBe(true)
  })
})

describe('opening times', () => {
  it.each(['09:00', '23:30', '00:00', '24:00', '', null])('accepts %s', (value) => {
    expect(validTime(value)).toBe(true)
  })

  it.each(['9am', '9:00', '09.00', '25:00', '12:60'])('refuses %s', (value) => {
    expect(validTime(value)).not.toBe(true)
  })

  it('is what both time fields check', () => {
    expect(field('opens').validate).toBe(validTime)
    expect(field('closes').validate).toBe(validTime)
  })
})
