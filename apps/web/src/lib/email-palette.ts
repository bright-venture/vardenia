import { colors } from '@vardenia/tokens'

/**
 * The brand palette, flattened for HTML email.
 *
 * # Why this file has to exist
 *
 * Email is the one place the design system cannot reach. Gmail strips
 * `<style>` blocks, Outlook renders through Word, and CSS custom properties are
 * unsupported almost everywhere that matters. Every colour in an email has to
 * be an inline hex literal.
 *
 * The rule the rest of the codebase follows - brand colour lives only in
 * packages/tokens - would therefore be broken by every email template, and was:
 * the two templates carried the *previous* palette long after the site had
 * moved on, so a password reset arrived looking like a different company.
 *
 * This resolves the tokens to literals at build time and hands them to the
 * templates. The hexes are still inline in the sent HTML, which is what email
 * needs, but there is exactly one place they come from.
 *
 * # Why not just use the token object directly
 *
 * These names say what the colour is *for* in an email, which is a smaller and
 * more stable vocabulary than the full palette. A template asking for
 * `palette.quiet` cannot accidentally reach for `cedar.300` and put an
 * illegible mid-tone on white.
 */
export const emailPalette = {
  /** The page behind the card. */
  page: colors.surface.raised,
  /** The card itself. */
  card: colors.surface.base,
  /** Card border and horizontal rules. */
  edge: colors.ink[100],

  /** Headings and anything that has to be read first. */
  strong: colors.ink[900],
  /** Body copy. */
  body: colors.ink[700],
  /** Secondary lines: the "ignore this" note, the raw URL. */
  quiet: colors.ink[500],

  /** The brand mark above the heading, and inline links. */
  accent: colors.gold[700],
  /** The one button. Cedar, so the action carries the brand. */
  buttonBg: colors.cedar[900],
  buttonText: colors.surface.base,

  /** A warning or cancellation block. */
  dangerText: colors.state.danger,
} as const
