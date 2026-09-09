'use client'

/**
 * The shortlist, on the client.
 *
 * # Why one provider rather than a saved flag on every card
 *
 * A heart appears on every listing card and on every listing page. Threading a
 * "saved" boolean down through the directory, the seven section pages, the home
 * grid, search and the related rail would mean every one of them fetching the
 * customer's saves and passing them through ListingGrid and ListingCard. Instead
 * this loads the saved slugs once, holds them in a Set, and every SaveButton
 * reads from here. The pages and the grid never learn the feature exists.
 *
 * # Why the sign-in state is discovered here, not passed from the server
 *
 * Reading the session in the layout would make every page under it dynamic, and
 * static rendering is the whole performance story of this site. So the provider
 * reads the session hint - a non-httpOnly cookie the middleware keeps agreeing
 * with the real token (see lib/session-hint) - and only when it names a customer
 * does it ask `GET /save`: a 200 carries the saved slugs, a 401 means the hint
 * had drifted and they are signed out after all. Anyone the hint does not call a
 * customer is settled with no request, which is most of the traffic on a public
 * directory. The layout stays static and reads no cookie; the only thing it
 * hands down is the sign-in path and the two words for the button.
 *
 * The hint is read reactively, not once. A sign-in or sign-out in this tab
 * changes the cookie and re-renders the provider, so the hearts follow the
 * session without a reload: they light up when a customer signs in and empty
 * when they sign out. See `subscribeHint` above for the cross-tab half of that.
 *
 * A signed-in reader sees their hearts light up a beat after the page paints,
 * which is the accepted cost of pages that stay ignorant of sessions. A signed-out
 * reader's hearts stay empty, and a press sends them to sign in and back.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { sessionAudience } from '../lib/session-hint'

/**
 * The session hint lives in a cookie, which changes with no React event to
 * announce it. Re-reading it when a tab is focused or becomes visible catches a
 * sign-in or sign-out that happened in another tab; one in this tab is caught by
 * the re-render its own navigation already causes. The header's AccountLink
 * subscribes exactly this way, for the same reason.
 */
const subscribeHint = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange)
  window.addEventListener('focus', onChange)
  return () => {
    document.removeEventListener('visibilitychange', onChange)
    window.removeEventListener('focus', onChange)
  }
}

interface SavedContextValue {
  isSaved: (slug: string) => boolean
  toggle: (slug: string) => void
  /** How many places are saved, for the header link. */
  count: number
  /** null until the first GET answers, then true or false. */
  signedIn: boolean | null
  labels: { save: string; saved: string }
}

const SavedContext = createContext<SavedContextValue>({
  isSaved: () => false,
  toggle: () => {},
  count: 0,
  signedIn: false,
  labels: { save: 'Save', saved: 'Saved' },
})

export function useSaved(): SavedContextValue {
  return useContext(SavedContext)
}

export function SavedProvider({
  loginPath,
  saveLabel,
  savedLabel,
  children,
}: {
  /** The localised /account/login path; the current URL is appended as `next`. */
  loginPath: string
  saveLabel: string
  savedLabel: string
  children: ReactNode
}) {
  /**
   * Whether a customer is signed in, read reactively from the session hint (a
   * non-httpOnly cookie the middleware keeps agreeing with the real token; see
   * lib/session-hint). `useSyncExternalStore` gives the server `false` and the
   * browser the live value, so every page prerenders signed-out and the browser
   * corrects it - and because the value is re-read whenever this re-renders, a
   * sign-in or sign-out in this very tab flips it with no reload.
   *
   * A partner counts as not-a-customer here: they hold a session, but not one
   * that can save, so pressing a heart should send them to sign in as a customer.
   */
  const isCustomer = useSyncExternalStore(
    subscribeHint,
    () => sessionAudience() === 'customer',
    () => false,
  )

  const [slugs, setSlugs] = useState<Set<string>>(() => new Set())

  /**
   * The `GET /save` verdict for a signed-in customer: null while it is still out,
   * true once their saves are loaded, false if the hint had drifted and they turn
   * out to be signed out after all. Only a customer ever fetches, so for everyone
   * else this stays null - `signedIn` below consults it only when the hint says
   * customer.
   */
  const [verdict, setVerdict] = useState<boolean | null>(null)

  // Both halves: the hint names a customer, and the GET has not refused. Derived
  // rather than stored so a hint change - a sign-out in this tab - empties the
  // hearts at once, with no effect left to run first.
  const signedIn: boolean | null = isCustomer ? verdict : false

  useEffect(() => {
    // Only a customer fetches; the hint has already turned everyone else away
    // with no request, which is what keeps a static, mostly anonymous site from
    // booting Payload on every first page load. The saved set is the one thing
    // the hint cannot carry and the hearts need.
    if (!isCustomer) return

    let cancelled = false
    fetch('/save', { headers: { accept: 'application/json' } })
      .then(async (r) => {
        if (cancelled) return
        // The hint said customer but the token is gone: drifted, and signed out.
        if (r.status === 401) {
          setVerdict(false)
          return
        }
        if (!r.ok) return
        const data = (await r.json()) as { slugs?: string[] }
        setVerdict(true)
        setSlugs(new Set(data.slugs ?? []))
      })
      .catch(() => {})

    return () => {
      cancelled = true
      // Leaving a customer session in this tab (a sign-out, or a switch to a
      // different account): drop the loaded saves and the verdict, so whoever
      // signs in next starts clean rather than seeing the last customer's hearts
      // for the beat before their own saves arrive.
      setVerdict(null)
      setSlugs(new Set())
    }
  }, [isCustomer])

  const flip = useCallback((slug: string) => {
    setSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }, [])

  const goSignIn = useCallback(() => {
    const next = window.location.pathname + window.location.search
    window.location.assign(`${loginPath}?next=${encodeURIComponent(next)}`)
  }, [loginPath])

  const isSaved = useCallback((slug: string) => slugs.has(slug), [slugs])

  const toggle = useCallback(
    (slug: string) => {
      if (signedIn === false) {
        goSignIn()
        return
      }

      flip(slug) // Optimistic: the heart answers the press, not the network.
      fetch('/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
        .then((r) => {
          // A session can lapse between load and press. Send them to sign in and
          // put the heart back rather than lying about a save that did not happen.
          if (r.status === 401) {
            setVerdict(false)
            flip(slug)
            goSignIn()
            return null
          }
          if (!r.ok) throw new Error(String(r.status))
          setVerdict(true)
          return r.json() as Promise<{ saved?: boolean }>
        })
        .then((data) => {
          if (data && typeof data.saved === 'boolean') {
            setSlugs((prev) => {
              const next = new Set(prev)
              if (data.saved) next.add(slug)
              else next.delete(slug)
              return next
            })
          }
        })
        .catch(() => flip(slug)) // Put it back the way it was.
    },
    [signedIn, flip, goSignIn],
  )

  const value = useMemo<SavedContextValue>(
    () => ({
      isSaved,
      toggle,
      count: slugs.size,
      signedIn,
      labels: { save: saveLabel, saved: savedLabel },
    }),
    [isSaved, toggle, slugs, signedIn, saveLabel, savedLabel],
  )

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>
}
