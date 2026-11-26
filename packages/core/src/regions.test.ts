import { describe, expect, it } from 'vitest'
import { CITY_ALIASES, GOVERNORATES, cityForPlace } from './regions'

const slugs = GOVERNORATES.flatMap((g) => g.cities.map((d) => d.slug))

describe('cities', () => {
  it('are the owner’s list of places, region by region (24 November 2026)', () => {
    const by = Object.fromEntries(GOVERNORATES.map((g) => [g.slug, g.cities.map((d) => d.en)]))
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
    for (const g of GOVERNORATES) for (const d of g.cities) expect(d.ar, d.slug).not.toBe('')
  })

  it('every alias points at a real city', () => {
    for (const [alias, slug] of Object.entries(CITY_ALIASES)) expect(slugs, alias).toContain(slug)
  })
})

describe('cityForPlace', () => {
  it('matches a city by its name, either half of a pair, or an alias', () => {
    expect(cityForPlace('Jounieh')).toBe('jounieh')
    expect(cityForPlace('DEIR EL QAMAR')).toBe('deir-el-qamar')
    expect(cityForPlace('Faraya')).toBe('faqra-faraya')
    expect(cityForPlace('Faqra')).toBe('faqra-faraya')
    expect(cityForPlace('Byblos')).toBe('jbeil')
    expect(cityForPlace('Saida')).toBe('sidon')
    expect(cityForPlace('Bsharri')).toBe('bsharri')
  })

  it('reads lists of places, the first city wins', () => {
    expect(cityForPlace('Faqra, Kfardebian')).toBe('faqra-faraya')
    expect(cityForPlace('Jbeil / Byblos')).toBe('jbeil')
    expect(cityForPlace('Jounieh ↔️ Harissa')).toBe('jounieh')
  })

  it('stays inside the region it is given', () => {
    expect(cityForPlace('Zahle', 'beqaa')).toBe('zahle')
    expect(cityForPlace('Zahle', 'keserwan')).toBeNull()
    expect(cityForPlace('Byblos', 'matn')).toBeNull()
  })

  it('answers null for anything else', () => {
    expect(cityForPlace('Some Town')).toBeNull()
    expect(cityForPlace('')).toBeNull()
    expect(cityForPlace(null)).toBeNull()
  })
})
