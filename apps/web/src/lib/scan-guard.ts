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

/** Stop the maps growing without bound on a long-lived server. */
const SWEEP_INTERVAL_MS = 5 * 60_000

type Timestamps = number[]

const lastSeen = new Map<string, number>()
const burst = new Map<string, Timestamps>()
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

export type SkipReason = 'bot' | 'duplicate' | 'burst'

export interface ScanVerdict {
  /** Whether to write a scan event and increment the counter. */
  count: boolean
  reason?: SkipReason
}

export function evaluateScan({ code, ip, userAgent, now = Date.now() }: ScanContext): ScanVerdict {
  if (userAgent && BOT_PATTERN.test(userAgent)) return { count: false, reason: 'bot' }

  // No address means we cannot dedupe. Count it rather than silently discard a
  // real scan; undercounting is the worse failure for an advertiser.
  if (!ip) return { count: true }

  sweep(now)
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
  return { count: true }
}

/** Best available client address behind Vercel, Cloudflare or a plain proxy. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('cf-connecting-ip') ?? headers.get('x-real-ip') ?? null
}

/** Test seam. The maps are module state, which a test must be able to reset. */
export function __resetScanGuard() {
  lastSeen.clear()
  burst.clear()
  lastSweep = 0
}
