import { ArrowUpRight } from 'lucide-react'
import { SECTIONS } from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../../i18n/routing'

/**
 * The seven sections, as a contents page.
 *
 * # Why a list and not the cards it replaces
 *
 * This is the commissioned design's treatment, and it is better here for
 * reasons beyond taste.
 *
 * The cards it replaces were seven WebGL canvases running animated shaders.
 * They looked good and they cost: a client component, a bundle, an
 * intersection observer per card, seven GPU contexts, and a fallback layer for
 * every way that can fail. This renders on the server and ships no JavaScript
 * at all - every state below is CSS.
 *
 * It also reads as what it is. A magazine's contents page is a numbered list,
 * and putting the seven sections in that form says "this is an edited thing"
 * more clearly than seven tiles do.
 *
 * # The numbers are decoration and are hidden from assistive tech
 *
 * `01` to `07` are a visual device from the design, not information: the
 * sections have no rank and the order is editorial. A screen reader announcing
 * "zero one, Stay" implies a sequence that does not exist, so they are
 * `aria-hidden` and the link's accessible name is the section and its
 * description.
 */

/**
 * The hover thumbnail in the design is deliberately absent.
 *
 * It shows a photograph per section, and there is no photography yet - every
 * listing in production still carries the shared placeholder. A row that
 * reveals a grey rectangle on hover is worse than a row that reveals nothing,
 * so the slot is left out rather than filled with a stand-in. Add it here when
 * there are pictures.
 */

export function SectionIndex({ locale }: { locale: Locale }) {
  const ar = locale === 'ar'

  return (
    <nav aria-label={ar ? 'أقسام الدليل' : 'Directory sections'}>
      <ul className="border-ink-100 border-t">
        {SECTIONS.map((section, index) => (
          <li key={section.path}>
            <Link
              href={`/${section.path}`}
              className="border-ink-100 group flex items-center gap-5 border-b py-5 lg:gap-10 lg:py-7"
            >
              <span aria-hidden className="text-ink-300 font-mono text-xs tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </span>

              {/*
                `rtl:-translate-x-2` mirrors the nudge, because a hover that
                moves the name toward the page edge instead of along the reading
                direction feels like a glitch rather than a response.
              */}
              <span className="font-display text-ink-900 group-hover:text-gold-700 text-2xl transition-[transform,color] duration-300 group-hover:translate-x-2 sm:text-4xl lg:text-5xl rtl:group-hover:-translate-x-2">
                {ar ? section.ar : section.en}
              </span>

              <span className="text-ink-500 hidden max-w-[240px] text-xs leading-snug lg:block">
                {ar ? section.descriptionAr : section.descriptionEn}
              </span>

              <ArrowUpRight
                aria-hidden
                size={22}
                className="text-ink-300 group-hover:text-gold-700 ms-auto shrink-0 transition-colors duration-300 rtl:-scale-x-100"
              />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
