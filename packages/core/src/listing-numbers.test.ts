import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LISTING_TOTAL,
  LISTING_GOVERNORATES,
  LISTING_NUMBER_MIN,
  ISSUE_COVERAGES,
  allocatedCount,
  coverageOf,
  isCityOf,
  isInRange,
  nextFreeNumber,
  numbersIn,
  orphanedNumbers,
  placeInIssue,
  placeRanges,
  rangeForPlace,
  rangePlaceProblem,
  rangeProblem,
  totalProblem,
  type NumberRange,
} from './listing-numbers'

const keserwan: NumberRange = { governorate: 'keserwan', from: 1, to: 90 }
const north: NumberRange = { governorate: 'north-lebanon', from: 91, to: 150 }

describe('constants', () => {
  it('has the agreed bounds and governorates', () => {
    expect(LISTING_NUMBER_MIN).toBe(1)
    expect(DEFAULT_LISTING_TOTAL).toBe(408)
    expect(LISTING_GOVERNORATES).toHaveLength(7)
  })
})

describe('rangeProblem', () => {
  it('accepts a free range', () => {
    expect(rangeProblem(keserwan, [], 408)).toBeNull()
  })

  it('names the governorate it overlaps', () => {
    const clash = { governorate: 'north-lebanon', from: 80, to: 150 }
    const text = rangeProblem(clash, [keserwan], 408)
    expect(text).toContain('overlaps')
    expect(text).toContain('keserwan')
  })

  it('rejects from > to, from < 1 and to > total', () => {
    expect(rangeProblem({ ...keserwan, from: 10, to: 5 }, [], 408)).not.toBeNull()
    expect(rangeProblem({ ...keserwan, from: 0, to: 5 }, [], 408)).not.toBeNull()
    expect(rangeProblem({ ...keserwan, from: 400, to: 409 }, [], 408)).not.toBeNull()
  })

  it('ignores the same governorate in others (editing its own range)', () => {
    expect(rangeProblem({ ...keserwan, to: 95 }, [keserwan], 408)).toBeNull()
  })
})

describe('nextFreeNumber', () => {
  it('continues after the highest range', () => {
    expect(nextFreeNumber([keserwan])).toBe(91)
    expect(nextFreeNumber([])).toBe(1)
  })
})

describe('helpers', () => {
  it('counts allocated numbers', () => {
    expect(allocatedCount([keserwan, north])).toBe(150)
  })

  it('lists and tests range members', () => {
    expect(numbersIn({ governorate: 'beirut', from: 3, to: 5 })).toEqual([3, 4, 5])
    expect(isInRange(90, keserwan)).toBe(true)
    expect(isInRange(91, keserwan)).toBe(false)
  })

  it('refuses a fraction, even inside the range', () => {
    expect(isInRange(1.5, keserwan)).toBe(false)
    expect(isInRange(Number.NaN, keserwan)).toBe(false)
  })

  it('finds held numbers outside a range', () => {
    expect(orphanedNumbers([5, 95], keserwan)).toEqual([95])
  })
})

describe('totalProblem', () => {
  it('refuses a total below the highest number in use', () => {
    expect(totalProblem(100, 150)).not.toBeNull()
    expect(totalProblem(408, 150)).toBeNull()
  })
})

describe('rangeProblem with city blocks', () => {
  const broummana: NumberRange = { governorate: 'matn', city: 'broummana', from: 21, to: 40 }

  it('checks two city blocks of one governorate against each other', () => {
    expect(
      rangeProblem({ governorate: 'matn', city: 'dbayeh', from: 30, to: 50 }, [broummana], 408),
    ).toBe('The range overlaps matn / broummana (21-40).')
    expect(
      rangeProblem({ governorate: 'matn', city: 'dbayeh', from: 41, to: 50 }, [broummana], 408),
    ).toBeNull()
  })

  it('still skips an entry of the same governorate and city (its own old value)', () => {
    expect(rangeProblem({ ...broummana, from: 25, to: 45 }, [broummana], 408)).toBeNull()
  })
})

describe('issue coverage', () => {
  it('has two kinds, and reads anything else (issues made before it) as All Lebanon', () => {
    expect(ISSUE_COVERAGES).toEqual(['all-lebanon', 'governorate'])
    expect(coverageOf('governorate')).toBe('governorate')
    expect(coverageOf('all-lebanon')).toBe('all-lebanon')
    expect(coverageOf(null)).toBe('all-lebanon')
    expect(coverageOf(undefined)).toBe('all-lebanon')
    expect(coverageOf('mars')).toBe('all-lebanon')
  })

  it('knows which cities belong to a governorate', () => {
    expect(isCityOf('matn', 'broummana')).toBe(true)
    expect(isCityOf('matn', 'jounieh')).toBe(false)
    expect(isCityOf('atlantis', 'broummana')).toBe(false)
  })
})

describe('rangeForPlace', () => {
  const ranges = [
    { id: 1, governorate: 'matn', city: null, from: 1, to: 20 },
    { id: 2, governorate: 'matn', city: 'broummana', from: 21, to: 40 },
    { id: 3, governorate: 'matn', city: 'dbayeh', from: 41, to: 60 },
  ]
  const allLebanon = { coverage: 'all-lebanon' }
  const matnOnly = { coverage: 'governorate', governorate: 'matn' }

  it("gives an All Lebanon issue's governorate-wide block, whatever the city", () => {
    expect(rangeForPlace(ranges, allLebanon, { governorate: 'matn', city: 'dbayeh' })?.id).toBe(1)
    expect(rangeForPlace(ranges, allLebanon, { governorate: 'matn' })?.id).toBe(1)
    expect(rangeForPlace(ranges, {}, { governorate: 'matn' })?.id).toBe(1)
    expect(rangeForPlace(ranges, allLebanon, { governorate: 'beirut' })).toBeNull()
  })

  it("gives a one-governorate issue's block of the same city only", () => {
    expect(rangeForPlace(ranges, matnOnly, { governorate: 'matn', city: 'dbayeh' })?.id).toBe(3)
    expect(rangeForPlace(ranges, matnOnly, { governorate: 'matn', city: 'bikfaya' })).toBeNull()
    expect(rangeForPlace(ranges, matnOnly, { governorate: 'matn' })).toBeNull()
    expect(rangeForPlace(ranges, matnOnly, { governorate: 'matn', city: null })).toBeNull()
  })

  it("never gives a one-governorate issue's block to another governorate", () => {
    const other = { coverage: 'governorate', governorate: 'keserwan' }
    expect(rangeForPlace(ranges, other, { governorate: 'matn', city: 'dbayeh' })).toBeNull()
  })
})

describe('placeInIssue', () => {
  const allLebanon = { coverage: 'all-lebanon' }
  const matnOnly = { coverage: 'governorate', governorate: 'matn' }

  it('takes the chosen governorate on an All Lebanon issue and always drops the city', () => {
    expect(placeInIssue(allLebanon, { governorate: 'matn', city: 'dbayeh' })).toEqual({
      governorate: 'matn',
      city: null,
    })
    expect(placeInIssue({}, { governorate: 'beirut' })).toEqual({
      governorate: 'beirut',
      city: null,
    })
    expect(placeInIssue(allLebanon, { governorate: 'atlantis' })).toBeNull()
    expect(placeInIssue(allLebanon, { city: 'dbayeh' })).toBeNull()
  })

  it("takes the issue's governorate on a one-governorate issue, never the one sent", () => {
    expect(placeInIssue(matnOnly, { governorate: 'beirut', city: 'dbayeh' })).toEqual({
      governorate: 'matn',
      city: 'dbayeh',
    })
    expect(placeInIssue(matnOnly, { city: 'broummana' })).toEqual({
      governorate: 'matn',
      city: 'broummana',
    })
  })

  it('needs a city of the issue governorate on a one-governorate issue', () => {
    expect(placeInIssue(matnOnly, { governorate: 'matn' })).toBeNull()
    expect(placeInIssue(matnOnly, { governorate: 'matn', city: '' })).toBeNull()
    expect(placeInIssue(matnOnly, { governorate: 'beirut', city: 'beirut' })).toBeNull()
    expect(placeInIssue({ coverage: 'governorate' }, { city: 'dbayeh' })).toBeNull()
  })
})

describe('placeRanges', () => {
  const ranges = [
    { id: 1, governorate: 'matn', city: null, from: 1, to: 20 },
    { id: 2, governorate: 'matn', city: 'broummana', from: 21, to: 40 },
    { id: 3, governorate: 'beirut', city: null, from: 41, to: 60 },
    { id: 4, governorate: 'beirut', city: 'beirut', from: 61, to: 70 },
  ]

  it('keeps the governorate-wide blocks of an All Lebanon issue', () => {
    expect(placeRanges(ranges, { coverage: 'all-lebanon' }).map((r) => r.id)).toEqual([1, 3])
  })

  it("keeps only the issue governorate's city blocks of a one-governorate issue", () => {
    const matnOnly = { coverage: 'governorate', governorate: 'matn' }
    expect(placeRanges(ranges, matnOnly).map((r) => r.id)).toEqual([2])
  })
})

describe('rangePlaceProblem', () => {
  const matnOnly = { coverage: 'governorate', governorate: 'matn' }
  const allLebanon = { coverage: 'all-lebanon' }

  it('accepts a city of the issue governorate, once', () => {
    expect(
      rangePlaceProblem({ issue: matnOnly, governorate: 'matn', city: 'broummana', others: [] }),
    ).toBeNull()
    expect(
      rangePlaceProblem({
        issue: matnOnly,
        governorate: 'matn',
        city: 'broummana',
        others: [{ governorate: 'matn', city: 'dbayeh' }],
      }),
    ).toBeNull()
  })

  it('refuses a block with no city on a one-governorate issue', () => {
    expect(
      rangePlaceProblem({ issue: matnOnly, governorate: 'matn', city: null, others: [] }),
    ).toBe('This issue is for Matn only: choose the city of this block.')
  })

  it('refuses another governorate on a one-governorate issue', () => {
    expect(
      rangePlaceProblem({ issue: matnOnly, governorate: 'beirut', city: 'beirut', others: [] }),
    ).toBe('This issue is for Matn only: choose Matn as the governorate of this block.')
  })

  it('refuses a city of another governorate', () => {
    expect(
      rangePlaceProblem({ issue: matnOnly, governorate: 'matn', city: 'jounieh', others: [] }),
    ).toBe("Jounieh is not in Matn. Choose one of Matn's cities.")
  })

  it('refuses a city that already has a block in the issue', () => {
    expect(
      rangePlaceProblem({
        issue: matnOnly,
        governorate: 'matn',
        city: 'broummana',
        others: [{ governorate: 'matn', city: 'broummana' }],
      }),
    ).toBe('Broummana already has a block in this issue.')
  })

  it('refuses a one-governorate issue with no governorate chosen', () => {
    expect(
      rangePlaceProblem({
        issue: { coverage: 'governorate' },
        governorate: 'matn',
        city: 'broummana',
        others: [],
      }),
    ).toMatch(/choose its governorate/)
  })

  it('refuses a city on an All Lebanon issue', () => {
    expect(
      rangePlaceProblem({ issue: allLebanon, governorate: 'matn', city: 'broummana', others: [] }),
    ).toBe(
      'This issue covers All Lebanon: a block is for a whole governorate. Leave the city empty.',
    )
  })

  it('refuses a second block for one governorate on an All Lebanon issue (NULL cities)', () => {
    expect(
      rangePlaceProblem({
        issue: {},
        governorate: 'matn',
        city: null,
        others: [{ governorate: 'matn', city: null }],
      }),
    ).toBe('Matn already has a block in this issue.')
    expect(
      rangePlaceProblem({
        issue: {},
        governorate: 'matn',
        city: null,
        others: [{ governorate: 'beirut' }],
      }),
    ).toBeNull()
  })
})
