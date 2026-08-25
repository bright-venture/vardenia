/**
 * Where a sign-in is allowed to send somebody afterwards.
 *
 * `?next=` exists so a reader sent to the sign-in page from somewhere else
 * lands back where they were. It is also, unguarded, the classic way to make a
 * phishing link look like it came from us: the domain in the address bar is
 * genuinely ours right up until the redirect fires, and the reader has just
 * been shown a real sign-in form on a real Vardenia page.
 *
 * # The guard this replaces looked right
 *
 * It was `next.startsWith('/')`, next to a comment saying only paths beginning
 * with a *single* slash were accepted. The comment described the intent
 * correctly and the code did not implement it: `//evil.com` starts with a
 * slash, and a protocol-relative URL is a fully external address.
 *
 * Nothing downstream caught it. next-intl decides a href is local by testing
 * for a protocol - `/^[a-z]+:/i` - which `//evil.com` does not have, so it was
 * passed through as an ordinary path; and on the default locale there is no
 * prefix added that would have defused it. The push left the site.
 *
 * # Why backslashes are refused too
 *
 * Browsers normalise `\` to `/` in the authority position, so `/\evil.com`
 * arrives at the same place as `//evil.com`. Anything checking only for a
 * double slash lets that through.
 *
 * # Why a fallback rather than a rejection
 *
 * Refusing to sign somebody in because a query parameter was wrong punishes the
 * reader for something an attacker did. The session is fine; only the
 * destination is suspect, so the destination is the only thing discarded.
 */

/**
 * The supplied path if it is safe to navigate to, otherwise `fallback`.
 *
 * Safe means: a path on this site. One leading slash, and the character after
 * it is neither a slash nor a backslash.
 */
export function safeNextPath(next: string | undefined | null, fallback: string): string {
  if (!next) return fallback
  if (!next.startsWith('/')) return fallback

  // `//host` and `/\host` are both external. Everything else with one leading
  // slash is a path on this site.
  const second = next[1]
  if (second === '/' || second === '\\') return fallback

  return next
}
