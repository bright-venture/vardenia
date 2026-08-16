import type { TextField } from 'payload'
import { isUsableExternalUrl, normalizeExternalUrl } from '../lib/external-url'

/**
 * A text field holding a link to somewhere off this site.
 *
 * Eight of these exist on a listing - website, reservation, menu, and five
 * socials - and every one is rendered straight into an `href`. They were plain
 * text fields with no validation, which produced two failures:
 *
 *  1. The likely one. An editor types `www.hotel.com`, the way people write
 *     domains. With no scheme the browser reads it as relative, so the Website
 *     button on a paying advertiser's page goes to /directory/www.hotel.com and
 *     404s. Nothing looks wrong in the admin, and nobody checks every button.
 *
 *  2. The serious one. `javascript:` in one of those fields is stored XSS on a
 *     public page. It needs a staff account, so it is a question of how far a
 *     compromised account reaches rather than an open door - but "our team
 *     handles all content" is exactly why that reach should be short.
 *
 * The rule itself already existed in lib/external-url.ts, written for QR codes
 * pointing off-site. It was simply never wired in here. Same module, so what
 * saves on a listing is judged by the same rule as what a printed code resolves
 * to.
 */
/**
 * Only the parts a caller needs to vary.
 *
 * Narrower than `Partial<TextField>` on purpose: TextField is a union of the
 * single and `hasMany` shapes, and spreading a partial of a union leaves
 * TypeScript unable to tell which half is being built.
 */
interface ExternalLinkOptions {
  name: string
  label?: TextField['label']
  admin?: TextField['admin']
}

export function externalLinkField({ name, label, admin }: ExternalLinkOptions): TextField {
  return {
    name,
    ...(label ? { label } : {}),
    type: 'text',
    /**
     * Empty is fine - all of these are optional. Only a value that could not
     * work in a browser is refused, and the message says what to type rather
     * than what was wrong, because "invalid URL" helps nobody.
     */
    validate: (value: unknown) => {
      if (value === null || value === undefined || value === '') return true
      if (isUsableExternalUrl(value)) return true
      return 'Enter a full web address, for example https://example.com'
    },
    hooks: {
      /**
       * Store the normalised form, so `hotel.com` is saved as
       * `https://hotel.com/` and the database holds something a browser can
       * use. The fallback to the raw value never runs in practice - validate
       * has already rejected anything normalise would refuse - but it keeps a
       * hook that cannot itself destroy data.
       */
      beforeChange: [({ value }) => (value ? (normalizeExternalUrl(value) ?? value) : value)],
    },
    admin: { placeholder: 'https://example.com', ...admin },
  }
}
