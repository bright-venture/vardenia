/**
 * Locale configuration shared by web (next-intl) and mobile.
 *
 * Arabic is RTL. Direction is derived here and nowhere else - every layout that
 * needs it reads `dirFor(locale)` so we never end up with a component that
 * hardcodes `dir="ltr"` and silently breaks the Arabic edition.
 */

export const LOCALES = ['en', 'ar'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

export const LOCALE_META = {
  en: { label: 'English', nativeLabel: 'English', dir: 'ltr', hreflang: 'en' },
  ar: { label: 'Arabic', nativeLabel: 'العربية', dir: 'rtl', hreflang: 'ar' },
} as const satisfies Record<
  Locale,
  { label: string; nativeLabel: string; dir: 'ltr' | 'rtl'; hreflang: string }
>

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}

export function dirFor(locale: Locale): 'ltr' | 'rtl' {
  return LOCALE_META[locale].dir
}

/**
 * Numbers stay Western-Arabic (1234) even in Arabic copy - Lebanese readers
 * expect Latin digits for prices and phone numbers, and mixing numeral systems
 * across print and digital looks amateurish.
 */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-LB-u-nu-latn' : 'en-LB').format(value)
}

export function formatDate(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-LB-u-nu-latn' : 'en-LB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(value)
}
