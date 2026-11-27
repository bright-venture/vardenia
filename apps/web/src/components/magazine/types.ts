/**
 * The viewer's data shapes. One definition: the route's lib owns it, this file
 * only re-exports the types (erased at build time, so no server code is bundled).
 */
export type { MagazineBusiness, MagazineData } from '../../lib/magazine-view'
export type { MagazinePage, MagazineRegion, Spread } from '@vardenia/core/magazine-view'
