'use client'

import NextLink from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronDown, Globe } from 'lucide-react'
import { LOCALES, LOCALE_META, type Locale } from '@vardenia/i18n'
import { getPathname, usePathname } from '../i18n/routing'

/**
 * Switches language without losing the reader's place.
 *
 * `usePathname` from our routing helper returns the path with the locale prefix
 * already stripped, so passing it back with a different `locale` rebuilds the
 * same page in the other language. Reading a listing and switching to French
 * keeps you on that listing.
 *
 * This is not a convenience feature. `localeDetection` is off (see
 * i18n/routing.ts, and the redirect loop that made it necessary), which means
 * until this exists a reader landing on an English URL has no route to another
 * language except editing the address bar.
 *
 * # A disclosure, not a row
 *
 * It used to be an inline `EN / ع` row, which stopped scaling the moment the
 * site went past two languages. A native `<details>` is a dropdown that opens
 * with no JavaScript, so it keeps working during static generation and for a
 * reader with scripting off.
 *
 * Each entry is labelled with the language's English name (Arabic, Chinese),
 * not its endonym (العربية, 中文). Endonyms read well to a native speaker but
 * turn the menu into a wall of scripts a given reader mostly cannot decode, and
 * they surfaced before any font for those scripts was loaded, so several showed
 * as tofu boxes. English names stay legible in one script until a language is
 * genuinely translated and its font is in place. `hrefLang` still carries the
 * real target locale for crawlers.
 *
 * The href is built with `getPathname` and handed to a plain next/link rather
 * than to next-intl's `Link` with a `locale` prop, which forces the prefix on
 * and cost a 307 and a non-canonical URL in the markup on every switch. Under
 * `localePrefix: 'as-needed'` the unprefixed form is the real English address.
 */

/**
 * The links themselves, given a query string rather than reading one.
 *
 * Split out so the header can render it during static generation. Reading the
 * query string requires `useSearchParams`, which forces the nearest Suspense
 * boundary to render on the client - and with this component in the layout, an
 * unbounded one would opt every page out of static rendering. This half has no
 * hooks that care, so it serves as the fallback.
 */
/**
 * Two presentations of the same links (10 November 2026):
 *
 * - `menu`, the desktop header's dropdown: a globe and the current language,
 *   opening a panel that lists all ten at once, the current one ticked.
 * - `sheet`, the phone menu: a full-width "Language" row in the style of the
 *   sheet's other folds, opening in place onto a two-column grid of 48px
 *   targets. It used to be the desktop dropdown dropped into the sheet: small
 *   grey type in a box with its own scroll bar, under the reader's thumb.
 *
 * Styled in home-finish.css (.vd-lang-*).
 */
export function LanguageSwitcherLinks({
  current,
  search,
  variant = 'menu',
}: {
  current: Locale
  search: string
  variant?: 'menu' | 'sheet'
}) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const menu = useRef<HTMLDetailsElement>(null)

  // The dropdown closes on a tap outside it and on Escape, as the header's
  // other menus do. The phone fold stays open until it is closed: it is part
  // of the sheet, not floating over the page.
  useEffect(() => {
    if (variant !== 'menu') return
    const outside = (event: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) {
        menu.current.open = false
      }
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.open) {
        menu.current.open = false
        menu.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [variant])

  const options = (
    <ul className="vd-lang-options">
      {LOCALES.map((locale) => {
        const meta = LOCALE_META[locale]

        if (locale === current) {
          return (
            <li key={locale}>
              <span aria-current="true" className="vd-lang-option">
                {meta.label}
                <Check aria-hidden className="vd-lang-check" strokeWidth={2} />
              </span>
            </li>
          )
        }

        return (
          <li key={locale}>
            <NextLink
              // Not prefetched: one of these is always the page already open,
              // and switching language is rare enough to wait for.
              prefetch={false}
              href={`${getPathname({ href: pathname, locale })}${search}`}
              hrefLang={locale}
              className="vd-lang-option"
            >
              {meta.label}
            </NextLink>
          </li>
        )
      })}
    </ul>
  )

  if (variant === 'sheet') {
    return (
      <details
        className="vd-lang-sheet"
        // It opens at the foot of the sheet: bring the choices into view.
        onToggle={(event) => {
          if (event.currentTarget.open) {
            event.currentTarget.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          }
        }}
      >
        <summary>
          <Globe aria-hidden className="size-[18px] shrink-0" strokeWidth={1.5} />
          <span className="vd-lang-sheet-label">{t('language')}</span>
          <span className="vd-lang-current">{LOCALE_META[current].label}</span>
          <ChevronDown aria-hidden className="vd-lang-chevron" strokeWidth={1.5} />
        </summary>
        {options}
      </details>
    )
  }

  return (
    <details ref={menu} className="vd-lang-menu">
      <summary aria-label={`${t('language')}: ${LOCALE_META[current].label}`}>
        <Globe aria-hidden className="size-4 shrink-0" strokeWidth={1.5} />
        <span>{LOCALE_META[current].label}</span>
        <ChevronDown aria-hidden className="vd-lang-chevron" strokeWidth={1.75} />
      </summary>
      <div className="vd-lang-panel">
        <p className="vd-lang-panel-title">{t('language')}</p>
        {options}
      </div>
    </details>
  )
}

/**
 * Carries the query string across the switch.
 *
 * Without this, a reader filtering the directory by category and switching
 * language landed on /ar/directory with the filter gone - and the same for a
 * page number. The path was preserved and the state on top of it was not, which
 * is the half of "keeps you where you were" nobody notices until they use it.
 */
export function LanguageSwitcher({
  current,
  variant,
}: {
  current: Locale
  variant?: 'menu' | 'sheet'
}) {
  const params = useSearchParams()
  const query = params.toString()

  return (
    <LanguageSwitcherLinks current={current} search={query ? `?${query}` : ''} variant={variant} />
  )
}
