import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The area, the address, "View on map" and "Get directions" follow the one
 * switch in lib/location-display, as they did before Task 4, so the owner can
 * hide them again in one line. (The hero's coordinates readout,
 * components/journey/Coordinates, was never gated on it and still is not.)
 *
 * The card is rendered both ways in components/ListingCard.test.tsx. The
 * listing page is an async server component that needs Payload and the
 * request's translations, so it is guarded here by its source instead: each of
 * those pieces must read SHOW_LOCATION. With the switch off,
 * `address` is null, which also removes the address row and its "View on map"
 * link, and the eyebrow drops the area and the directions button is not drawn.
 */
const page = readFileSync(
  join(__dirname, '../app/(frontend)/[locale]/directory/[slug]/page.tsx'),
  'utf8',
)

describe('the listing page follows SHOW_LOCATION', () => {
  it('imports the switch', () => {
    expect(page).toContain("import { SHOW_LOCATION } from '../../../../../lib/location-display'")
  })

  it('has no address (so no address row and no "View on map") while it is off', () => {
    expect(page).toMatch(/const address = SHOW_LOCATION \?/)
    // The only address row and the only map link inside it hang off `address`.
    expect(page).toMatch(/\{address \? \(\s*<Row label=\{t\('address'\)\}>/)
  })

  it('drops the area from the line above the name while it is off', () => {
    expect(page).toContain('SHOW_LOCATION ? place : null')
  })

  it('draws no directions button while it is off', () => {
    expect(page).toMatch(/\{SHOW_LOCATION &&\s*hasMapTarget\(/)
    // One ActionBar, the gated one.
    expect(page.match(/<ActionBar\b/g)).toHaveLength(1)
  })
})
