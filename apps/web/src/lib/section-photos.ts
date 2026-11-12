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
    // Since 12 November 2026, over the terrace's lower corner.
    inset: {
      src: '/sections/eat-and-drink-table.webp',
      alt: 'A linen napkin folded like a doorway on a plate, opening onto a candlelit Lebanese restaurant where a waiter pulls out a chair, a copy of Vardenia beside it',
      width: 1024,
      height: 1280,
    },
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
 * The magazine's own photograph (11 November 2026): the All Lebanon issue with
 * the seven regional editions. Header of /magazine and /magazine/issues, where
 * Baalbek stood before. Portrait, so those two frames are portrait too.
 */
export const MAGAZINE_PHOTO = {
  src: '/magazine/all-lebanon-collection.webp',
  alt: 'The All Lebanon issue of Vardenia on a stone slab, above the seven regional editions: Metn, Chouf, Beqaa, South, North, Beirut and Keserwan',
  width: 1122,
  height: 1402,
}
