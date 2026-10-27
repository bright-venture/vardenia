import { GOVERNORATES } from '@vardenia/core'
export type Feeling =
  'all' | 'coast' | 'mountain' | 'heritage' | 'nature' | 'villages' | 'harbours' | 'sunsets'
export const DESTINATIONS = [
  {
    id: 'byblos',
    name: 'Byblos',
    ar: 'جبيل',
    region: 'Jbeil',
    regionAr: 'جبيل',
    where: 'jbeil',
    feeling: 'coast',
    image: 'byblos.webp',
    lat: 34.1217,
    lon: 35.6434,
    alt: 'Fishing boats in the old harbour of Byblos',
    note: 'Follow the harbour into the old town, past stone façades and narrow lanes.',
    noteAr: 'من المرفأ إلى البلدة القديمة، بين الواجهات الحجرية والأزقة الضيقة.',
    source: 'https://documents1.worldbank.org/curated/en/951351468054863844/pdf/397870LB.pdf',
  },
  {
    id: 'bsharri',
    name: 'Bsharri',
    ar: 'بشري',
    region: 'The North',
    regionAr: 'الشمال',
    where: 'bsharri',
    feeling: 'mountain',
    image: 'bsharri.webp',
    lat: 34.2511,
    lon: 36.0111,
    alt: 'Bsharri village beneath the slopes of Mount Lebanon',
    note: 'Red roofs, mountain slopes and a view that invites a longer pause.',
    noteAr: 'قرميد أحمر ومنحدرات جبلية وإطلالة تدعوك إلى البقاء.',
    source: 'https://en.wikipedia.org/wiki/Bsharri',
  },
  {
    id: 'beirut',
    name: 'Raouché · Beirut',
    ar: 'الروشة · بيروت',
    region: 'Beirut',
    regionAr: 'بيروت',
    where: 'beirut',
    feeling: 'heritage',
    image: 'beirut.webp',
    lat: 33.8899,
    lon: 35.4703,
    alt: 'Pigeon Rocks rising from the Mediterranean at Raouché in Beirut',
    note: 'At Raouché, the Mediterranean opens up beside the everyday life of the city.',
    noteAr: 'في الروشة، يمتد المتوسط إلى جانب إيقاع المدينة اليومي.',
    source: 'https://www.wikidata.org/wiki/Q12219879',
  },
  {
    id: 'baalbek',
    name: 'Baalbek',
    ar: 'بعلبك',
    region: 'Bekaa',
    regionAr: 'البقاع',
    where: 'baalbek',
    feeling: 'heritage',
    image: 'baalbek.webp',
    lat: 34.0067,
    lon: 36.2033,
    alt: 'The six surviving columns of the Temple of Jupiter at Baalbek',
    note: 'Look up at the columns, then closer at the carved stone below them.',
    noteAr: 'ارفع نظرك إلى الأعمدة، ثم تأمل نقوش الحجر عند قدميك.',
    source: 'https://en.wikipedia.org/wiki/Temple_of_Jupiter_(Baalbek)',
  },
  {
    id: 'tyre',
    name: 'Tyre',
    ar: 'صور',
    region: 'The South',
    regionAr: 'الجنوب',
    where: 'tyre',
    feeling: 'coast',
    image: 'tyre.webp',
    lat: 33.2708,
    lon: 35.1961,
    alt: 'Fishing boats and buildings around the harbour in Tyre',
    note: 'Boats, pale façades and a southern town gathered around its harbour.',
    noteAr: 'قوارب وواجهات مضيئة ومدينة جنوبية تجتمع حول مرفئها.',
    source: 'https://en.wikipedia.org/wiki/Tyre,_Lebanon',
  },
  {
    id: 'deir-el-qamar',
    name: 'Deir el Qamar',
    ar: 'دير القمر',
    region: 'Chouf',
    regionAr: 'الشوف',
    where: 'chouf',
    feeling: 'mountain',
    image: 'deir-el-qamar.webp',
    lat: 33.698,
    lon: 35.5645,
    alt: 'Fakhreddine Mosque and the stone architecture of Deir el Qamar',
    note: 'A square, a minaret and the warm stone of a Chouf village.',
    noteAr: 'ساحة ومئذنة ودفء الحجر في إحدى قرى الشوف.',
    source: 'https://commons.wikimedia.org/wiki/Category:Fakhreddine_Mosque',
  },
] as const
export type Destination = (typeof DESTINATIONS)[number]
export const routePath =
  'M640 0 C680 180 210 200 260 430 S850 690 680 980 S170 1130 270 1440 S890 1690 650 1990 S440 2240 500 2400'
export function coordinates(p: { lat: number; lon: number }) {
  return `${p.lat.toFixed(4)}° N   ${p.lon.toFixed(4)}° E`
}
/**
 * The directory filtered to a destination's area.
 *
 * The directory's `where` takes a governorate only; a district goes in
 * `district`, under its governorate (see parseFilterState). Four of the six
 * destinations are districts (Jbeil, Bsharri, Tyre, Chouf), and sent as
 * `where` they were silently dropped, so "Explore this region" opened the
 * whole directory. A district now names its governorate as well.
 */
export function directoryFor(p: Pick<Destination, 'where'>) {
  if (GOVERNORATES.some((g) => g.slug === p.where)) return `/directory?where=${p.where}`
  const parent = GOVERNORATES.find((g) => g.districts.some((d) => d.slug === p.where))
  return parent ? `/directory?where=${parent.slug}&district=${p.where}` : '/directory'
}

/** A place can belong to several ways of exploring; filters never imply bookable activities. */
const THEMES: Record<Destination['id'], readonly Exclude<Feeling, 'all'>[]> = {
  byblos: ['coast', 'heritage', 'harbours', 'sunsets'],
  bsharri: ['mountain', 'nature'],
  beirut: ['coast', 'heritage', 'sunsets'],
  baalbek: ['heritage'],
  tyre: ['coast', 'heritage', 'harbours', 'sunsets'],
  'deir-el-qamar': ['mountain', 'heritage', 'nature', 'villages'],
}
export function matchesFeeling(place: Pick<Destination, 'id'>, feeling: Feeling) {
  return feeling === 'all' || THEMES[place.id].includes(feeling)
}
