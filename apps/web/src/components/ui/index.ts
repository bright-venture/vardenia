/**
 * The shared kit.
 *
 * One import path for everything a page composes itself from, so a new route
 * reaches for the existing piece rather than writing a fifth version of a card.
 * If something here has to be a client component it says so in its own file;
 * everything currently in the kit renders on the server, which is what keeps
 * the prerendered pages prerendered.
 */

export { Plate, type PlateRatio } from './Plate'
export { Band, Eyebrow, type BandTone } from './Band'
export { Button, ButtonLink, type ButtonVariant, type ButtonSize } from './Button'
export { Stars } from './Stars'
export { Tier, type TierKind } from './Tier'
export { EmptyState } from './EmptyState'
export { Rule } from './Rule'
export { Prose } from './Prose'
