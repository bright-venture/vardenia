import { describe, expect, it } from 'vitest'
import { DISTRICT_ALIASES, GOVERNORATES, districtForPlace } from './regions'

const slugs = GOVERNORATES.flatMap((g) => g.districts.map((d) => d.slug))

describe('districts', () => {
  it('are the owner’s list of places, region by region (24 November 2026)', () => {
    const by = Object.fromEntries(GOVERNORATES.map((g) => [g.slug, g.districts.map((d) => d.en)]))
    expect(by.keserwan).toEqual([
      'Jounieh',
      'Harissa',
      'Kaslik',
      'Ghazir',
      'Tabarja',
      'Faqra / Faraya',
      'Jbeil',
    ])
    expect(by['north-lebanon']).toEqual([
      'Batroun',
      'Chekka',
      'Koura',
      'Tripoli',
      'Zgharta',
      'Bcharre',
      'Akkar',
    ])
    expect(by.chouf).toEqual([
      'Deir el Qamar',
      'Beiteddine',
      'Baakline',
      'Moukhtara',
      'Barouk',
      'Jiyeh',
      'Damour',
    ])
    expect(by.matn).toEqual([
      'Dbayeh',
      'Broummana',
      'Bikfaya',
      'Baabda',
      'Hammana',
      'Aley',
      'Bassour',
    ])
    expect(by.beqaa).toEqual([
      'Zahle',
      'Baalbek',
      'West Bekaa',
      'Hermel',
      'Chtoura',
      'Saghbine',
      'Masnaa',
    ])
    expect(by['south-lebanon']).toEqual(['Saida', 'Sour', 'Jezzine'])
    expect(by.beirut).toEqual(['Beirut'])
  })

  it('have unique slugs and an Arabic name each', () => {
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const g of GOVERNORATES) for (const d of g.districts) expect(d.ar, d.slug).not.toBe('')
  })

  it('every alias points at a real district', () => {
    for (const [alias, slug] of Object.entries(DISTRICT_ALIASES))
      expect(slugs, alias).toContain(slug)
  })
})

describe('districtForPlace', () => {
  it('matches a district by its name, either half of a pair, or an alias', () => {
    expect(districtForPlace('Jounieh')).toBe('jounieh')
    expect(districtForPlace('DEIR EL QAMAR')).toBe('deir-el-qamar')
    expect(districtForPlace('Faraya')).toBe('faqra-faraya')
    expect(districtForPlace('Faqra')).toBe('faqra-faraya')
    expect(districtForPlace('Byblos')).toBe('jbeil')
    expect(districtForPlace('Saida')).toBe('sidon')
    expect(districtForPlace('Bsharri')).toBe('bsharri')
  })

  it('reads lists of places, the first district wins', () => {
    expect(districtForPlace('Faqra, Kfardebian')).toBe('faqra-faraya')
    expect(districtForPlace('Jbeil / Byblos')).toBe('jbeil')
    expect(districtForPlace('Jounieh ↔️ Harissa')).toBe('jounieh')
  })

  it('stays inside the region it is given', () => {
    expect(districtForPlace('Zahle', 'beqaa')).toBe('zahle')
    expect(districtForPlace('Zahle', 'keserwan')).toBeNull()
    expect(districtForPlace('Byblos', 'matn')).toBeNull()
  })

  it('answers null for anything else', () => {
    expect(districtForPlace('Some Town')).toBeNull()
    expect(districtForPlace('')).toBeNull()
    expect(districtForPlace(null)).toBeNull()
  })
})
