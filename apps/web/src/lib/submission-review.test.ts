import { describe, expect, it } from 'vitest'
import { agreedPrice, reviewRows } from './submission-review'

const FULL = {
  status: 'pending',
  ownerName: 'Sami Khoury',
  ownerEmail: 'sami@example.com',
  ownerPhone: '+961 3 123 456',
  pageTemplate: 'b',
  submittedAt: '2026-11-23T10:00:00.000Z',
  reference: 'VD-42',
  termsVersion: '2026-11',
  priceAtAcceptance: 20,
  currency: 'USD',
  termMonths: 12,
  termsAcceptedAt: '2026-11-23T10:00:00.000Z',
  listingNumber: 17,
}

const row = (label: string, values = FULL) => reviewRows(values).find(([l]) => l === label)?.[1]

describe('reviewRows', () => {
  it('shows owner, layout, submitted, terms, price agreed with when accepted, reference and page', () => {
    expect(row('Owner')).toBe('Sami Khoury')
    expect(row('Email')).toBe('sami@example.com')
    expect(row('Phone')).toBe('+961 3 123 456')
    expect(row('Layout')).toBe('B')
    expect(row('Submitted')).toBe('23 Nov 2026, 12:00')
    expect(row('Terms version')).toBe('2026-11')
    expect(row('Price agreed')).toBe('$20 for 12 months, accepted 23 Nov 2026, 12:00')
    expect(row('Reference')).toBe('VD-42')
    expect(row('Page number')).toBe('17')
  })

  it('says Not given for what is missing instead of leaving a gap', () => {
    expect(row('Owner', {} as never)).toBe('Not given')
    expect(row('Price agreed', {} as never)).toBe('Not given')
  })

  it('shows the rejection only on a rejected submission', () => {
    expect(reviewRows(FULL).some(([l]) => l === 'Reason')).toBe(false)
    const rejected = reviewRows({ ...FULL, status: 'rejected', rejectionReason: 'No' })
    expect(rejected.find(([l]) => l === 'Reason')?.[1]).toBe('No')
  })

  it('shows no payment field', () => {
    const labels = reviewRows({ ...FULL, status: 'rejected' }).map(([l]) => l.toLowerCase())
    expect(labels.join(' ')).not.toMatch(/pay|whish|deadline|paid/)
  })

  it('formats other currencies', () => {
    expect(agreedPrice({ priceAtAcceptance: 30, currency: 'eur', termMonths: 6 })).toBe(
      '30 EUR for 6 months',
    )
  })
})
