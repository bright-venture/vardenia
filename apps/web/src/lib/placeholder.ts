import type { Locale } from '@vardenia/i18n'
import { CONTACT } from './contact'

/**
 * The marker for a fact nobody has settled, and the one way to write one.
 *
 * Lifted out of lib/legal so that the marketing pages and the contact details
 * can use the same marker without importing a legal document, and so that
 * lib/contact can be read by all of them without a cycle.
 *
 * Anything carrying this renders as a bordered block rather than as body text.
 * The point is that an unfinished clause cannot quietly look finished - these
 * documents sit in front of readers for months before anybody signs them off,
 * and a draft set in the same type as the rest reads as settled.
 */

export const PLACEHOLDER = 'TO CONFIRM:'

/** Marks a fact or decision nobody has established yet. */
export const TBD = (what: string) => `${PLACEHOLDER} ${what}`

/**
 * A whole line, never a fragment to drop into a sentence.
 *
 * This is the lesson from the privacy policy, which had a placeholder in the
 * middle of a sentence: the marker is stripped before rendering, so
 * `Write to ${TBD('an address')}` came out as "Write to an address" inside a
 * block headed NOT SETTLED, dragging the settled half of the sentence in with
 * it and leaving text that does not parse.
 *
 * So each of these returns a complete sentence in both states. Where there is a
 * detail it reads as an instruction; where there is not, the whole line is the
 * marked gap and nothing settled is attached to it.
 */

/**
 * The locale these lines are being written into.
 *
 * Optional, and English when omitted, because the legal documents are still
 * English in both editions and call these without one. Only the standing pages
 * pass a locale.
 *
 * The `TO CONFIRM` marker itself is deliberately NOT translated. It is a
 * signal to us rather than copy for a reader, `lib/legal` counts unresolved
 * clauses by matching on it, and two spellings of a marker is how a count
 * silently starts missing half of them.
 */
/**
 * Every UI language, not just the two that existed when this was written.
 *
 * It took `'en' | 'ar'` and every other language fell to English, so the
 * French contact page ended in "Write to ...". Records rather than a switch, so
 * the compiler refuses a language left out. Each line ends in its language's
 * own full stop: the danda in Hindi and Bengali, the Urdu full stop, and the
 * full-width stop in Chinese.
 */

/** How to reach us by email, or a marked note that there is no address yet. */
export const contactEmail = (lang: Locale = 'en'): string => {
  const email = CONTACT.email
  if (!email) {
    return TBD('an email address to publish here, so that a reader has a way to reach us')
  }

  const line: Record<Locale, string> = {
    en: `Write to **${email}**.`,
    ar: `راسلنا على **${email}**.`,
    fr: `Écrivez-nous à **${email}**.`,
    es: `Escríbenos a **${email}**.`,
    pt: `Escreva para **${email}**.`,
    ru: `Пишите нам на **${email}**.`,
    zh: `请发邮件至 **${email}**。`,
    hi: `हमें **${email}** पर लिखें।`,
    bn: `আমাদের **${email}** ঠিকানায় লিখুন।`,
    ur: `ہمیں **${email}** پر لکھیں۔`,
  }
  return line[lang]
}

/** The postal address. The privacy policy needs one whether or not it is shown. */
export const contactPostal = (lang: Locale = 'en'): string => {
  const address = CONTACT.postalAddress
  if (!address) return TBD('a postal address, which the privacy policy also has to name')

  const line: Record<Locale, string> = {
    en: `By post: ${address}.`,
    ar: `بالبريد: ${address}.`,
    fr: `Par courrier : ${address}.`,
    es: `Por correo postal: ${address}.`,
    pt: `Por correio: ${address}.`,
    ru: `Почтой: ${address}.`,
    zh: `邮寄地址：${address}。`,
    hi: `डाक से: ${address}।`,
    bn: `ডাকযোগে: ${address}।`,
    ur: `بذریعہ ڈاک: ${address}۔`,
  }
  return line[lang]
}

/** The phone number, when there is one worth committing to answer. */
export const contactPhone = (): string | null =>
  CONTACT.phone ? `By phone: ${CONTACT.phone}.` : null
