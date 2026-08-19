/**
 * Outbound email configuration.
 *
 * Until now Payload had no adapter, so every message it wanted to send was
 * written to the console. That is harmless while the only account is a staff
 * login somebody sets up by hand, and it stops being harmless the moment a
 * customer asks to reset a password: the reset link is generated, logged, and
 * never delivered. From the outside that looks exactly like a request that was
 * never made.
 *
 * # Missing configuration disables email rather than crashing
 *
 * The alternative was to refuse to start, which is what `lib/db.ts` does when
 * the database internals are wrong. That is right there and wrong here. A bad
 * schema means the scan counter silently writes somewhere else, and the damage
 * accrues invisibly; a missing email key means password resets do not arrive,
 * which is bad but obvious, and refusing to boot would take the whole public
 * directory down with it. A magazine nobody can read is a worse outcome than a
 * password reset nobody receives.
 *
 * So it degrades, and `emailWarning` makes the degradation visible on the admin
 * dashboard - the same treatment the indexing switch gets, and for the same
 * reason: the failure is silent and nobody would otherwise go looking.
 */

export interface EmailSettings {
  apiKey: string
  from: string
  fromName: string
  /** When set, every message goes here instead of its real recipient. */
  overrideTo?: string
}

/**
 * The four variables this reads.
 *
 * `process.env` needs a cast at the call sites below: every property here is
 * optional, which makes this a "weak type", and TypeScript refuses an assignment
 * from a type sharing none of its properties. NodeJS.ProcessEnv declares only
 * NODE_ENV by name, so it shares nothing with this - a real rule catching a real
 * class of typo, just not this case.
 */
export interface EmailEnv {
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  EMAIL_FROM_NAME?: string
  EMAIL_OVERRIDE_TO?: string
}

const DEFAULT_FROM_NAME = 'Vardenia'

/**
 * Deliberately loose. The point is to catch a placeholder, an empty string or a
 * bare name that somebody typed instead of an address - not to adjudicate
 * RFC 5322, which no regular expression wins.
 */
function isPlausibleAddress(value: string): boolean {
  if (/\s/.test(value)) return false
  const parts = value.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts
  if (!local || !domain) return false
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.')
}

const clean = (value: string | undefined): string => (value ?? '').trim()

/**
 * The settings, or null when email is not configured.
 *
 * Null rather than a partially-filled object: an adapter with a key and no from
 * address fails on every send, at the far end, with an error nobody sees. Better
 * to have no adapter and one visible warning.
 */
export function emailSettings(env: EmailEnv = process.env as EmailEnv): EmailSettings | null {
  const apiKey = clean(env.RESEND_API_KEY)
  const from = clean(env.EMAIL_FROM)

  if (!apiKey) return null
  if (!from || !isPlausibleAddress(from)) return null

  const overrideTo = clean(env.EMAIL_OVERRIDE_TO)

  return {
    apiKey,
    from,
    fromName: clean(env.EMAIL_FROM_NAME) || DEFAULT_FROM_NAME,
    ...(overrideTo && isPlausibleAddress(overrideTo) ? { overrideTo } : {}),
  }
}

/**
 * What to show on the admin dashboard, or null when there is nothing to say.
 *
 * Two different problems, and the second is the one that would otherwise go
 * unnoticed for weeks.
 */
export function emailWarning(env: EmailEnv = process.env as EmailEnv): string | null {
  const settings = emailSettings(env)

  if (!settings) {
    const apiKey = clean(env.RESEND_API_KEY)
    const from = clean(env.EMAIL_FROM)

    if (!apiKey && !from) {
      return 'No email is configured, so password resets and booking confirmations are written to the server log instead of being delivered. Set RESEND_API_KEY and EMAIL_FROM.'
    }
    if (!apiKey) {
      return 'RESEND_API_KEY is missing, so no email can be sent. EMAIL_FROM alone does nothing.'
    }
    return `EMAIL_FROM is missing or not an address (${from || 'empty'}), so no email can be sent.`
  }

  /**
   * The dangerous one.
   *
   * `overrideRecipientAddress` exists so a staging environment cannot email real
   * customers, which is exactly right - and catastrophic if it survives into
   * production, because every booking confirmation then goes to one inbox and
   * every customer gets nothing. Nothing about that fails; the send succeeds.
   */
  if (settings.overrideTo) {
    return `All outgoing email is being redirected to ${settings.overrideTo}. Customers are receiving nothing. Clear EMAIL_OVERRIDE_TO before going live.`
  }

  return null
}
