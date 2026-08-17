/**
 * What a code points at, and whether that is safe to print.
 *
 * Split out from qr-image.ts so the admin preview can import it. That module
 * pulls in the `qrcode` renderer, which is server-side only - importing it from
 * a client component would drag the whole encoder into the browser bundle.
 * These two functions are pure string work with no dependencies.
 */

/** What the code actually encodes. Never the destination - see packages/core/src/qr.ts. */
export function scanUrl(code: string, siteUrl = process.env.NEXT_PUBLIC_SITE_URL): string {
  const base = (siteUrl ?? 'http://localhost:3000').replace(/\/$/, '')
  return `${base}/g/${code}`
}

/**
 * Hosts that exist but are not ours to keep.
 *
 * The original check only knew about localhost, on the assumption that an
 * unreachable host is the danger. It is not the only one, and it is not the
 * worst one. A deploy preview is perfectly reachable, serves real pages over
 * real HTTPS, and stops being our address the day the domain is pointed
 * somewhere else. A sheet generated against localhost looks obviously wrong.
 * A sheet generated against vardenia.vercel.app looks finished.
 *
 * This is a denylist, and a denylist is never complete. That is acceptable here
 * because the failure being prevented is forgetting, not evasion: nobody is
 * trying to defeat the banner, they are trying to get a proof out on a Friday.
 * The hosts below are the ones a Vardenia deploy could plausibly be sitting on
 * when that happens, plus the tunnels used to show work in progress on a phone.
 */
const EPHEMERAL_HOSTS: RegExp[] = [
  /^localhost$/,
  /\.localhost$/,
  /\.local$/,

  // Hosting platforms, before a domain is attached.
  /(^|\.)vercel\.app$/,
  /(^|\.)netlify\.app$/,
  /(^|\.)netlify\.live$/,
  /(^|\.)pages\.dev$/,
  /(^|\.)onrender\.com$/,
  /(^|\.)up\.railway\.app$/,
  /(^|\.)fly\.dev$/,

  // Tunnels, which are how a laptop ends up with an https address at all.
  /(^|\.)ngrok\.io$/,
  /(^|\.)ngrok\.app$/,
  /(^|\.)ngrok-free\.app$/,
  /(^|\.)trycloudflare\.com$/,
  /(^|\.)loca\.lt$/,

  // Cloud development environments.
  /(^|\.)app\.github\.dev$/,
  /(^|\.)gitpod\.io$/,
  /(^|\.)replit\.dev$/,
]

/** A literal address is never a magazine's domain, and cannot hold a public certificate. */
function isIpLiteral(host: string): boolean {
  if (host.startsWith('[')) return true
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
}

/**
 * Whether the domain baked into these codes is one the public can reach *and*
 * one we will still control when the magazine is on a table in a hotel lobby.
 *
 * The host is not a rendering detail: it is printed into the symbol and cannot be
 * changed afterwards. Generating a sheet on a laptop and sending it to press
 * produces 20,000 copies pointing at localhost, which fail silently for every
 * reader and cannot be repointed the way a destination can. Nothing here blocks
 * generation - previewing locally is normal and useful - but every surface that
 * offers a print download says so out loud.
 *
 * Permanence is the whole test, which is why a working deploy preview fails it.
 */
export function isPrintSafeBaseUrl(siteUrl = process.env.NEXT_PUBLIC_SITE_URL): boolean {
  const base = siteUrl ?? ''
  if (!base.startsWith('https://')) return false

  let host: string
  try {
    host = new URL(base).hostname.toLowerCase()
  } catch {
    // An unparseable value is not a domain anyone can reach.
    return false
  }

  if (!host) return false
  if (isIpLiteral(host)) return false
  return !EPHEMERAL_HOSTS.some((pattern) => pattern.test(host))
}
