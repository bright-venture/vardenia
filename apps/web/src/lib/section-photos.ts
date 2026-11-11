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
}

export const SECTION_PHOTOS: Record<string, SectionPhoto> = {
  stay: {
    src: '/sections/stay.webp',
    alt: 'A stone bedroom opening through green doors onto a terrace and the mountains',
  },
  'eat-and-drink': {
    src: '/sections/eat-and-drink.webp',
    alt: 'A table of Lebanese mezze above the sea: hummus, tabbouleh, grilled halloumi and vine leaves',
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
