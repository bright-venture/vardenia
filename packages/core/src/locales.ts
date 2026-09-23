/**
 * The UI languages, as the request schemas accept them.
 *
 * # Why core has its own copy
 *
 * The list lives in @vardenia/i18n, and core does not depend on it: core is the
 * domain layer the mobile app imports too, and pulling i18n in would bring the
 * message catalogues with it for the sake of ten short strings. So the list is
 * repeated here and pinned to the real one by a test in apps/web
 * (lib/locales-agree.test), which fails the moment the two differ.
 *
 * # What it replaced, and what that cost
 *
 * `bookingRequestSchema` and `signupSchema` each took `z.enum(['en', 'ar'])`,
 * written when those were the only two languages. The site then gained eight
 * more, the forms kept sending the page's own language, and the schemas kept
 * refusing it. Measured on dev in September 2026: a booking or a sign-up sent
 * from /fr, /zh, /hi or /ur came back 400 - "Invalid enum value. Expected 'en'
 * | 'ar'". Nobody reading the site in eight of its ten languages could open an
 * account or book a table, and nothing on the page said why.
 */
export const LOCALE_CODES = ['en', 'ar', 'fr', 'es', 'pt', 'ru', 'zh', 'hi', 'bn', 'ur'] as const

export type LocaleCode = (typeof LOCALE_CODES)[number]
