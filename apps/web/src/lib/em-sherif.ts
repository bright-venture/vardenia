import { resolveImage, type MediaField } from './media'

// Editorial copy for the English Beirut restaurant listing. Other Em Sherif concepts
// and branches have their own menus. The restaurant maintains its service times here.
export const emSherifBeirut = {
  title: 'Em Sherif Restaurant in Monot, Beirut',
  name: 'Em Sherif Restaurant',
  description: 'Em Sherif Restaurant serves Lebanese cuisine on Damascus Street in Monot, Beirut. See the Beirut menu and check service hours before planning a visit.',
  intro: 'In Beirut’s Monot neighbourhood, the meal at Em Sherif unfolds across small plates of Lebanese classics. Find the restaurant on Damascus Street.',
  streetAddress: 'Damascus Street, Monot',
  hoursUrl: 'https://emsherifrestaurant.com/menu/',
  menuUrl: 'https://emsherif-menu.com/restaurant',
}

export function emSherifProfile(
  listing: { slug?: string | null; category?: string | null; governorate?: string | null },
  locale: string,
) {
  return locale === 'en' && listing.slug === 'em-sherif' &&
    listing.category === 'food-and-beverage' && listing.governorate === 'beirut'
    ? emSherifBeirut
    : null
}

export function emSherifPhoto(image: MediaField): MediaField {
  // The demo upload is a graphic of the venue name. The first real upload
  // should automatically become the hero and the search preview image.
  return resolveImage(image, 'hero')?.src.includes('/seed-business-em-sherif-') ? null : image
}
