/**
 * Locale configuration shared by web (next-intl) and mobile.
 *
 * English is the default and lives at the root; every other locale is prefixed.
 * A reader picks a language with the switcher (LanguageSwitcher); nothing is
 * guessed from the browser (see i18n/routing).
 *
 * # Supported is not the same as translated
 *
 * All the locales below are routable and offered in the switcher. Only `en` and
 * `ar` have their own message catalogue; the rest fall back to English until a
 * catalogue is written for them (see messages.ts) - so choosing French today
 * gives a French URL rendering English copy, which is a real, working page
 * rather than a broken one, and the translation drops in later with no code
 * change. hreflang is advertised only for the translated pair (lib/seo), because
 * telling Google a page is French when it is English is worse than saying
 * nothing.
 *
 * # Direction is derived here and nowhere else
 *
 * Arabic and Urdu are RTL. Every layout that needs direction reads
 * `dirFor(locale)`, so a new RTL locale never means hunting for a hardcoded
 * `dir="ltr"` that silently breaks it.
 *
 * # A note on fonts, for whoever translates one of these
 *
 * The Latin locales (en, es, fr, pt) and the Arabic-script ones (ar, ur) render
 * with the fonts already loaded. Chinese, Hindi, Bengali and Russian carry
 * scripts those fonts do not cover, so before their translations go live a face
 * for each script has to be added in apps/web/src/app/fonts.ts. Until then they
 * are English, in a Latin font, which needs nothing.
 */

export const LOCALES = ['en', 'ar', 'fr', 'es', 'pt', 'ru', 'zh', 'hi', 'bn', 'ur'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/**
 * The locales with real content: their own message catalogue, and the locales
 * the CMS stores localized fields in. Everything else falls back to English.
 *
 * This is deliberately narrower than LOCALES. The UI is offered in ten languages;
 * the curated data (listing names, articles, category labels) is written in two.
 * A French reader gets a French URL, English chrome (until fr.json exists), and
 * English listings (until the editorial team translates them) - one honest
 * fallback rather than a promise the content cannot keep. Widening the data side
 * is a bigger step: it grows the CMS locale enum (a migration) and puts a tab per
 * language on every localized field in the admin, so it waits until a language is
 * genuinely being translated at the content level.
 */
export const TRANSLATED_LOCALES = ['en', 'ar'] as const
export type ContentLocale = (typeof TRANSLATED_LOCALES)[number]

/**
 * The locale to query the CMS in for a given UI locale.
 *
 * The CMS localizes over TRANSLATED_LOCALES only, so a UI locale it does not
 * store maps to English - the same fallback the rest of the site uses. Pass this,
 * not the raw UI locale, to any Payload `find` with a `locale`.
 */
export function dataLocale(locale: Locale): ContentLocale {
  return locale === 'ar' ? 'ar' : 'en'
}

export const LOCALE_META = {
  en: { label: 'English', nativeLabel: 'English', dir: 'ltr', hreflang: 'en' },
  ar: { label: 'Arabic', nativeLabel: 'العربية', dir: 'rtl', hreflang: 'ar' },
  fr: { label: 'French', nativeLabel: 'Français', dir: 'ltr', hreflang: 'fr' },
  es: { label: 'Spanish', nativeLabel: 'Español', dir: 'ltr', hreflang: 'es' },
  pt: { label: 'Portuguese', nativeLabel: 'Português', dir: 'ltr', hreflang: 'pt' },
  ru: { label: 'Russian', nativeLabel: 'Русский', dir: 'ltr', hreflang: 'ru' },
  zh: { label: 'Chinese', nativeLabel: '中文', dir: 'ltr', hreflang: 'zh' },
  hi: { label: 'Hindi', nativeLabel: 'हिन्दी', dir: 'ltr', hreflang: 'hi' },
  bn: { label: 'Bengali', nativeLabel: 'বাংলা', dir: 'ltr', hreflang: 'bn' },
  ur: { label: 'Urdu', nativeLabel: 'اردو', dir: 'rtl', hreflang: 'ur' },
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
