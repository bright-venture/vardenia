import { createHash } from 'node:crypto'

/**
 * Decides whether a scan should count, never whether it should work.
 *
 * The redirect always happens. A printed code is in circulation for a year and
 * must resolve for everyone, every time, including someone hammering refresh.
 * What this guards is the number, because that number is the evidence behind a
 * renewal conversation and it has to survive being questioned.
 *
 * Three things inflate scan counts in practice, in descending order of how often
 * they actually occur:
 *
 *  1. Link preview bots. Paste a Vardenia URL into WhatsApp and Meta's crawler
 *     fetches it. Share it in a Slack channel and Slack does too. None of these
 *     are readers.
 *  2. The same person refreshing, or a browser retrying on a flaky connection.
 *  3. Deliberate inflation, which is rare but is the one an advertiser will
 *     accuse you of if the numbers ever look implausible.
 *
 * Addresses are hashed with the app secret and held only in memory, never
 * written anywhere. That keeps this consistent with the privacy posture in
 * ADR 0002: we do not build a location history of readers, and a rate limiter
 * is not an excuse to start.
 */

/** Bots that fetch a URL to render a preview, plus ordinary search crawlers. */
const BOT_PATTERN =
  /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|telegram|slackbot|discordbot|twitterbot|linkedinbot|embedly|quora link preview|pinterest|redditbot|applebot|bingpreview|vkshare|w3c_validator|skypeuripreview|preview|curl|wget|python-requests|axios|node-fetch|headless/i

/** Same person, same code, inside this window counts once. */
const DEDUPE_WINDOW_MS = 60_000

/** Ceiling on counted scans from one address across all codes. */
const BURST_WINDOW_MS = 10 * 60_000
const BURST_LIMIT = 20

/**
 * Ceiling on counted scans for a single code, regardless of who they came from.
 *
 * Every other guard here keys off the client address, and the client address is
 * only as trustworthy as the proxy in front of us. Deployed behind Vercel or
 * Cloudflare that is fine. Deployed with nothing in front, `x-forwarded-for` is
 * written by the caller, and a script rotating invented addresses defeats both
 * the dedupe and the per-address ceiling - which was demonstrated against this
 * exact code: six requests from one machine produced six counted scans.
 *
 * This limit does not care about addresses, so it holds either way. It cannot
 * stop inflation, but it bounds it: an attacker gets 60 a minute rather than as
 * many as they can send.
 *
 * 60 is deliberately far above real traffic. A single printed code being
 * scanned once a second sustained would be a remarkable result for a magazine;
 * anything past that is a script, and the comment on undercounting still holds -
 * we would rather lose a genuine scan at the top of an implausible spike than
 * report a number an advertiser can disprove.
 */
const CODE_WINDOW_MS = 60_000
const CODE_LIMIT = 60

/** Stop the maps growing without bound on a long-lived server. */
const SWEEP_INTERVAL_MS = 5 * 60_000

type Timestamps = number[]

const lastSeen = new Map<string, number>()
const burst = new Map<string, Timestamps>()
const codeBurst = new Map<string, Timestamps>()
let lastSweep = 0

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now

  for (const [key, at] of lastSeen) {
    if (now - at > DEDUPE_WINDOW_MS) lastSeen.delete(key)
  }
  for (const [key, times] of burst) {
    const live = times.filter((t) => now - t < BURST_WINDOW_MS)
    if (live.length === 0) burst.delete(key)
    else burst.set(key, live)
  }
  for (const [key, times] of codeBurst) {
    const live = times.filter((t) => now - t < CODE_WINDOW_MS)
    if (live.length === 0) codeBurst.delete(key)
    else codeBurst.set(key, live)
  }
}

/** One-way, salted, in-memory only. We never hold a raw address. */
function fingerprint(ip: string): string {
  return createHash('sha256')
    .update(`${process.env.PAYLOAD_SECRET ?? 'vardenia'}:${ip}`)
    .digest('base64url')
    .slice(0, 22)
}

export interface ScanContext {
  code: string
  ip: string | null
  userAgent: string | null
  now?: number
}

export type SkipReason = 'bot' | 'duplicate' | 'burst' | 'code-burst'

export interface ScanVerdict {
  /** Whether to write a scan event and increment the counter. */
  count: boolean
  reason?: SkipReason
}

export function evaluateScan({ code, ip, userAgent, now = Date.now() }: ScanContext): ScanVerdict {
  if (userAgent && BOT_PATTERN.test(userAgent)) return { count: false, reason: 'bot' }

  sweep(now)

  // Checked before anything address-based, because this is the only guard that
  // still holds when the address itself is forged.
  const codeRecent = (codeBurst.get(code) ?? []).filter((t) => now - t < CODE_WINDOW_MS)
  if (codeRecent.length >= CODE_LIMIT) {
    codeBurst.set(code, codeRecent)
    return { count: false, reason: 'code-burst' }
  }

  const accept = (): ScanVerdict => {
    codeBurst.set(code, [...codeRecent, now])
    return { count: true }
  }

  // No address means we cannot dedupe. Count it rather than silently discard a
  // real scan; undercounting is the worse failure for an advertiser.
  if (!ip) return accept()

  const id = fingerprint(ip)

  const dedupeKey = `${id}:${code}`
  const previous = lastSeen.get(dedupeKey)
  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) {
    // Refresh the window so a rapid burst stays collapsed into one.
    lastSeen.set(dedupeKey, now)
    return { count: false, reason: 'duplicate' }
  }

  const recent = (burst.get(id) ?? []).filter((t) => now - t < BURST_WINDOW_MS)
  if (recent.length >= BURST_LIMIT) {
    burst.set(id, recent)
    return { count: false, reason: 'burst' }
  }

  lastSeen.set(dedupeKey, now)
  burst.set(id, [...recent, now])
  return accept()
}

/**
 * Best available client address, in order of how hard it is to forge.
 *
 * The previous version read the leftmost entry of `x-forwarded-for` first, which
 * is the one value in the whole request that the caller writes themselves.
 * Proxies append, so a request arriving as
 *
 *     X-Forwarded-For: 203.0.113.9, <real client ip>
 *
 * reported `203.0.113.9`. Six requests from one machine, each with a different
 * invented address, produced six counted scans: dedupe and the burst ceiling
 * were both bypassed completely. That number is the evidence behind a renewal,
 * so anyone able to send HTTP requests could inflate a listing's performance -
 * or a competitor's, to make the whole dataset look untrustworthy.
 *
 * Order now:
 *  1. `cf-connecting-ip` / `x-nf-client-connection-ip` / `x-real-ip`, which
 *     Cloudflare, Netlify and Vercel set themselves and overwrite if a client
 *     supplies one.
 *  2. The RIGHTMOST `x-forwarded-for` entry, appended by the nearest proxy,
 *     rather than the leftmost, which the client controls.
 *
 * This assumes exactly one trusted proxy in front of the app - the normal shape
 * on Vercel, on Netlify or behind Cloudflare. Exposed directly to the internet
 * with no proxy at all, every one of these headers is caller-supplied and none of
 * them can be trusted; that is a deployment property, not something this function
 * can fix.
 */
export function clientIp(headers: Headers): string | null {
  const platform =
    headers.get('cf-connecting-ip') ??
    headers.get('x-nf-client-connection-ip') ??
    headers.get('x-real-ip')
  if (platform?.trim()) return platform.trim()

  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    const nearest = hops[hops.length - 1]
    if (nearest) return nearest
  }

  return null
}

/** Test seam. The maps are module state, which a test must be able to reset. */
export function __resetScanGuard() {
  lastSeen.clear()
  burst.clear()
  codeBurst.clear()
  lastSweep = 0
}
