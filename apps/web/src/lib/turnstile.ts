import { reportError } from './report'

/**
 * Cloudflare Turnstile, in front of the one endpoint that creates an account.
 *
 * # What it adds that rate limiting does not
 *
 * `/auth/signup` is already rate limited per IP, and that bounds one caller.
 * It does not bound a caller with addresses: a script rotating through a
 * residential proxy pool sits under every per-IP limit and still creates
 * accounts, each one sending a verification email from our domain.
 *
 * That last part is what makes this worth doing before launch rather than
 * after. The cost of an abused sign-up form is not rows in a table - those are
 * cheap and deletable - it is a few thousand unsolicited messages sent from
 * vardenia.com, and a sending reputation that then puts real password resets in
 * everybody's junk folder for weeks. There is no button to undo that.
 *
 * The send cap in lib/email-cap bounds the damage. This is meant to stop it
 * starting.
 *
 * # Inert until configured, and that is the safe direction
 *
 * With no secret set, `verifyTurnstile` returns `ok` without calling anything.
 * So this ships dark: it can be merged, deployed and left alone until somebody
 * creates a Cloudflare account, and nothing about sign-up changes in the
 * meantime.
 *
 * The alternative - failing closed when unconfigured - would mean this commit
 * breaks sign-up on the next deploy for want of an environment variable, which
 * is a worse failure than the one it prevents. The trade is deliberate and it
 * is the reason `isTurnstileConfigured` exists separately: the admin dashboard
 * can say plainly that the protection is off, the same way it does for
 * indexing, rather than leaving it a silent nothing.
 *
 * # Why the secret is checked and not the site key
 *
 * The site key is public and lives in the widget. Only the secret proves we can
 * actually verify a token, and a page rendering a widget whose token nothing
 * checks is worse than no widget: it looks protected and is not.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** How long to wait for Cloudflare before giving up. */
const TIMEOUT_MS = 5_000

export type TurnstileVerdict =
  | { ok: true; skipped: boolean }
  | { ok: false; reason: 'missing-token' | 'rejected' | 'unavailable' }

/** Whether a secret exists, so the check can actually be enforced. */
export function isTurnstileConfigured(secret = process.env.TURNSTILE_SECRET_KEY): boolean {
  return Boolean(secret?.trim())
}

/**
 * Check one token with Cloudflare.
 *
 * `remoteIp` is optional and passed through when known; Cloudflare uses it to
 * sharpen its own scoring and the check works without it.
 *
 * # It fails closed on a rejection and open on an outage
 *
 * A token Cloudflare rejects is a refusal: that is the whole feature. But
 * Cloudflare being unreachable is our problem, not the reader's, and turning
 * their outage into our sign-up outage trades a small risk for a total one. So
 * a network failure or a timeout reports and allows, and the rate limit and the
 * send cap remain in force underneath.
 */
export async function verifyTurnstile(
  token: unknown,
  remoteIp?: string | null,
  secret = process.env.TURNSTILE_SECRET_KEY,
): Promise<TurnstileVerdict> {
  if (!isTurnstileConfigured(secret)) return { ok: true, skipped: true }

  if (typeof token !== 'string' || !token.trim()) return { ok: false, reason: 'missing-token' }

  const body = new URLSearchParams({ secret: String(secret).trim(), response: token.trim() })
  if (remoteIp) body.set('remoteip', remoteIp)

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      await reportError(new Error(`Turnstile answered ${response.status}`), {
        source: 'auth.turnstile',
      })
      return { ok: true, skipped: true }
    }

    const result = (await response.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (result.success === true) return { ok: true, skipped: false }

    return { ok: false, reason: 'rejected' }
  } catch (error) {
    /**
     * Reported rather than swallowed. An outage that silently disables the
     * protection is how you find out months later that it has been off.
     */
    await reportError(error, { source: 'auth.turnstile', extra: { stage: 'verify' } })
    return { ok: true, skipped: true }
  }
}

/**
 * What the admin home says about the anti-bot check (21 November 2026,
 * authentication audit). Both failures are silent everywhere else:
 *
 * - No secret: every check is skipped, so sign-up, the business form and the
 *   Questions form accept anyone.
 * - A secret but no site key: the page shows no widget, so no answer is ever
 *   sent and every check fails: nobody can sign up or send the business form.
 *
 * Null when both keys are set. The site key is read as the build saw it, which
 * is what the pages actually use.
 */
export interface TurnstileWarning {
  title: string
  detail: string
  tone: 'warn' | 'error'
}

export function turnstileWarning(
  secret = process.env.TURNSTILE_SECRET_KEY,
  siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
): TurnstileWarning | null {
  const hasSecret = isTurnstileConfigured(secret)
  const hasSiteKey = Boolean(siteKey?.trim())
  if (hasSecret && hasSiteKey) return null
  if (hasSecret) {
    return {
      title: 'Anti-bot check cannot work',
      detail:
        'TURNSTILE_SECRET_KEY is set but NEXT_PUBLIC_TURNSTILE_SITE_KEY is not, so every sign-up and business form is refused. Set the site key in Netlify and deploy again.',
      tone: 'error',
    }
  }
  return {
    title: 'Anti-bot check is off',
    detail:
      'TURNSTILE_SECRET_KEY is not set, so sign-up, the business form and the Questions form accept anyone, bots included. Set both Turnstile keys in Netlify.',
    tone: 'warn',
  }
}
