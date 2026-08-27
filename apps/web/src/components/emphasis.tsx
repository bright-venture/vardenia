import type { ReactNode } from 'react'

/**
 * The only markup the written pages use: bold runs, and an address you can tap.
 *
 * # Why this is shared rather than copied
 *
 * ContentPage and LegalDocument each had their own identical copy, which is how
 * the mailto below would have ended up on one of them and not the other. The
 * privacy policy is the page where a missing link matters most, because the
 * address there is what a data request is sent to, and it is also the page
 * nobody rereads.
 *
 * # Why the address becomes a link
 *
 * `contactEmail()` writes `Write to **contact@vardenia.com**.` and that rendered
 * as bold text, which on a phone is a string to be selected, retyped and got
 * wrong. A published address that is awkward to use is only half published.
 *
 * Only a bold run that is *entirely* an address is linked. Anything looser would
 * start finding addresses inside sentences and inside the legal text, where a
 * stray link is a change to a document somebody has to sign off.
 */

/** Strict on purpose: one @, no spaces, and a dot in the domain. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isEmailAddress(text: string): boolean {
  return EMAIL.test(text)
}

/** Bold runs written as **this**, with an address inside one rendered as a link. */
export function withEmphasis(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    const key = `${keyPrefix}-${index}`

    if (!part.startsWith('**') || !part.endsWith('**')) {
      return <span key={key}>{part}</span>
    }

    const inner = part.slice(2, -2)

    if (isEmailAddress(inner)) {
      return (
        <a
          key={key}
          href={`mailto:${inner}`}
          className="text-ink-900 font-semibold underline underline-offset-2"
        >
          {inner}
        </a>
      )
    }

    return (
      <strong key={key} className="text-ink-900 font-semibold">
        {inner}
      </strong>
    )
  })
}
