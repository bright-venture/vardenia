/**
 * Public contact details of a listing: phone, WhatsApp, email and social links.
 *
 * One rule set, shared by the Businesses `contact` group (validate + normalise
 * hook), the public submission schema and the form. Every value is optional; a
 * blank one means "not given".
 */

export const CONTACT_FIELDS = [
  'phone',
  'whatsapp',
  'email',
  'instagram',
  'facebook',
  'tiktok',
  'snapchat',
  'youtube',
  'x',
  'linkedin',
] as const
export type ContactField = (typeof CONTACT_FIELDS)[number]

export const SOCIAL_FIELDS = [
  'instagram',
  'facebook',
  'tiktok',
  'snapchat',
  'youtube',
  'x',
  'linkedin',
] as const
export type SocialField = (typeof SOCIAL_FIELDS)[number]

/** Hosts a link may be on (the host itself or any subdomain, e.g. www. or m.). */
const SOCIAL_HOSTS: Record<SocialField, readonly string[]> = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  tiktok: ['tiktok.com'],
  snapchat: ['snapchat.com'],
  youtube: ['youtube.com', 'youtu.be'],
  x: ['x.com', 'twitter.com'],
  linkedin: ['linkedin.com'],
}

/** Networks where a bare handle is turned into a full URL. */
const HANDLE_URL: Partial<Record<SocialField, (handle: string) => string>> = {
  instagram: (h) => `https://instagram.com/${h}`,
  tiktok: (h) => `https://tiktok.com/@${h}`,
  x: (h) => `https://x.com/${h}`,
  snapchat: (h) => `https://snapchat.com/add/${h}`,
}

const HANDLE_RE = /^@?([A-Za-z0-9._]{1,30})$/
const PHONE_RE = /^[0-9 +\-()]{6,20}$/
const URL_MAX = 300

const isSocial = (field: ContactField): field is SocialField =>
  (SOCIAL_FIELDS as readonly string[]).includes(field)

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

function validEmailAddress(value: string): boolean {
  if (value.length > 254 || /\s/.test(value)) return false
  const parts = value.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts
  return Boolean(local && domain && domain.includes('.') && !domain.startsWith('.'))
}

function socialUrl(field: SocialField, value: string): string | undefined {
  if (value.length > URL_MAX || /\s/.test(value)) return undefined
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return undefined
    }
    if (url.protocol !== 'https:' || url.username || url.password) return undefined
    const host = url.hostname.toLowerCase()
    const ok = SOCIAL_HOSTS[field].some((h) => host === h || host.endsWith(`.${h}`))
    return ok ? value : undefined
  }
  const match = HANDLE_RE.exec(value)
  const build = HANDLE_URL[field]
  if (!match || !build) return undefined
  return build(match[1]!)
}

/**
 * The value to store: social handles become full URLs, everything else is
 * trimmed. Blank is undefined. Does not judge validity; see validContactValue.
 */
export function normaliseContact(field: ContactField, value: unknown): string | undefined {
  const v = clean(value)
  if (!v) return undefined
  if (isSocial(field)) return socialUrl(field, v) ?? v
  return v
}

/** What kind of problem a refused value has; the form shows a sentence per code. */
export type ContactProblemCode = 'phone' | 'email' | 'link'

export type ContactCheck = { ok: true } | { ok: false; code: ContactProblemCode; message: string }

const PHONE_MESSAGE = 'Use 6 to 20 characters: digits, spaces, +, - and parentheses.'
const EMAIL_MESSAGE = 'Enter a valid email address.'

function linkMessage(field: SocialField): string {
  return HANDLE_URL[field]
    ? `Enter an https:// link on ${SOCIAL_HOSTS[field].join(' or ')}, or just the handle.`
    : `Enter an https:// link on ${SOCIAL_HOSTS[field].join(' or ')}.`
}

/** A value judged, with a code and a readable reason when refused. Blank is fine. */
export function checkContactValue(field: ContactField, value: unknown): ContactCheck {
  const v = clean(value)
  if (!v) return { ok: true }
  if (field === 'phone' || field === 'whatsapp') {
    return PHONE_RE.test(v) ? { ok: true } : { ok: false, code: 'phone', message: PHONE_MESSAGE }
  }
  if (field === 'email') {
    return validEmailAddress(v)
      ? { ok: true }
      : { ok: false, code: 'email', message: EMAIL_MESSAGE }
  }
  if (isSocial(field) && !socialUrl(field, v)) {
    return { ok: false, code: 'link', message: linkMessage(field) }
  }
  return { ok: true }
}

/** true, or a readable reason. Blank is fine (every field is optional). */
export function validContactValue(field: ContactField, value: unknown): true | string {
  const verdict = checkContactValue(field, value)
  return verdict.ok ? true : verdict.message
}

/** Every message checkContactValue can give, with its code. */
const CODE_BY_MESSAGE: ReadonlyMap<string, ContactProblemCode> = new Map<
  string,
  ContactProblemCode
>([
  [PHONE_MESSAGE, 'phone'],
  [EMAIL_MESSAGE, 'email'],
  ...SOCIAL_FIELDS.map((field): [string, ContactProblemCode] => [linkMessage(field), 'link']),
])

/**
 * The code of a message checkContactValue gave, matched exactly; undefined for
 * any other text. For a message that crossed the network as a field error
 * (the schema's field errors carry the message only).
 */
export function contactProblemCode(message: string): ContactProblemCode | undefined {
  return CODE_BY_MESSAGE.get(message)
}
