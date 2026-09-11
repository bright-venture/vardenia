import { useTranslations } from 'next-intl'

/**
 * The badge on a listing that says what kind of listing it is.
 *
 * # These two mean different things and must not be merged
 *
 * `verified` is a fact about the place: somebody from Vardenia went, and what
 * the page says matches what is there. `signature` is a fact about the
 * contract: the business is on the top tier and gets the larger treatment in
 * print and online.
 *
 * Showing them in the same colour would let a reader infer that paying more
 * makes a listing more trustworthy, which is exactly the inference a directory
 * has to refuse. So verified is cedar - the brand saying it stands behind this
 * - and signature is gold, the commercial mark. A place can carry both.
 *
 * # Why the label comes from the catalogue
 *
 * `useTranslations` is isomorphic in next-intl, so this stays synchronous and
 * needs no locale prop while still reading the right language. What it must not
 * be is the English string on a site whose readers use it in ten languages.
 */

export type TierKind = 'verified' | 'signature'

/**
 * Both measured on the ivory ground, because a badge is small type and small
 * type is where contrast fails first. Gold.300 on navy is 6.84:1; ivory on
 * gold.700 is 5.79:1. The pair this replaces - navy on gold.500 - was 3.74:1.
 */
const STYLES = {
  verified: 'bg-cedar-900 text-gold-300',
  signature: 'bg-gold-700 text-surface-base',
} as const

export function Tier({ kind, className = '' }: { kind: TierKind; className?: string }) {
  const t = useTranslations()
  // The long form, for a tooltip and for anyone listening rather than looking.
  // Verified reuses the directory description (already reviewed in Arabic); the
  // signature long form lives under `tier`.
  const full = kind === 'verified' ? t('directory.verified') : t('tier.signatureLong')

  return (
    /**
     * The visible word is the short form because the badge is 60px wide. The
     * accessible name is the long one, because "Verified" on its own does not
     * say who verified it or what that involved - and a listener gets no help
     * from the gold, the placement or the fact that it sits on the photograph.
     *
     * `title` as well, for a sighted reader who wants the same answer. It is
     * not load-bearing: `title` is unreliably announced and invisible on a
     * touch screen, which is exactly why the aria-label is there too.
     */
    <span
      role="img"
      aria-label={full}
      title={full}
      className={`font-mono text-[9.5px] font-medium uppercase tracking-[0.13em] ${STYLES[kind]} px-2 py-1 ${className}`}
    >
      {t(`tier.${kind}`)}
    </span>
  )
}
