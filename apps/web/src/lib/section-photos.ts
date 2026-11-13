/**
 * Each section's own photograph (11 November 2026), for its page's header and
 * its row in the Discover menu. Until then a section borrowed one of the home
 * page's destinations (Bsharri for Stay, Byblos for Eat & Drink...), with that
 * place's coordinates, which read as if every hotel were in Bsharri.
 *
 * Files in public/sections, 1536x1024, supplied by the team. Keyed by the
 * section's path (@vardenia/core SECTIONS); a test keeps the two in step.
 */
export interface SectionPhoto {
  src: string
  alt: string
  /**
   * A second, smaller picture laid over the first one's lower corner, as Getting
   * Around has had since 12 November 2026 (the coast road running out of the
   * magazine's page).
   */
  inset?: { src: string; alt: string; width: number; height: number }
}

export const SECTION_PHOTOS: Record<string, SectionPhoto> = {
  stay: {
    src: '/sections/stay.webp',
    alt: 'A stone bedroom opening through green doors onto a terrace and the mountains',
  },
  'eat-and-drink': {
    // The team's terrace dinner at sunset, since 11 November 2026.
    src: '/sections/eat-and-drink-terrace.webp',
    alt: 'Dinner on a stone terrace above the sea at sunset: hummus, tabbouleh, grilled meat, bread and a glass of white wine under bougainvillea',
  },
  experiences: {
    src: '/sections/experiences.webp',
    alt: 'Two hikers on a mountain trail, framed by a rock arch, above a stone village',
  },
  weddings: {
    src: '/sections/weddings.webp',
    alt: 'A long candlelit table under an olive tree at sunset, above the hills',
  },
  lifestyle: {
    src: '/sections/lifestyle.webp',
    alt: 'A woman walking past shop windows and café tables along an old stone street',
  },
  'getting-around': {
    src: '/sections/getting-around.webp',
    alt: 'A drive along the coast road, a passenger holding a copy of Vardenia',
    inset: {
      src: '/sections/getting-around-road.webp',
      alt: 'An open Vardenia magazine whose page becomes a winding mountain road, a classic copper sports car driving out of it',
      width: 1122,
      height: 1402,
    },
  },
}

/**
 * The Magazine and Issues pages' photographs, shared with the Magazine menu so
 * the picture a reader points at is the page it opens (the designer's v2
 * update, 13 November 2026). Until then both pages showed the collection.
 *
 * Magazine: the seven regional magazines in an open gift box. Issues: the All
 * Lebanon issue above the seven editions. Portrait, so both frames are too.
 */
export const MAGAZINE_PAGE_PHOTO = {
  src: '/journey/all-lebanon-box.webp',
  alt: 'The seven Vardenia regional magazines of the All Lebanon collection, in an open gift box',
  width: 1122,
  height: 1402,
}
export const ISSUES_PAGE_PHOTO = {
  src: '/magazine/all-lebanon-collection.webp',
  alt: 'The All Lebanon issue of Vardenia on a stone slab, above the seven regional editions: Metn, Chouf, Beqaa, South, North, Beirut and Keserwan',
  width: 1122,
  height: 1402,
}
