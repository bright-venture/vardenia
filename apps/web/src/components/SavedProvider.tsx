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
 * reads the session hint on mount - a non-httpOnly cookie the middleware keeps
 * true (see lib/session-hint) - and only when it names a customer does it ask
 * `GET /save`: a 200 carries the saved slugs, a 401 means the hint had drifted
 * and they are signed out after all. Anyone the hint does not call a customer is
 * settled with no request, which is most of the traffic on a public directory.
 * The layout stays static and reads no cookie; the only thing it hands down is
 * the sign-in path and the two words for the button, all of which are static.
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
  type ReactNode,
} from 'react'
import { sessionAudience } from '../lib/session-hint'

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
  const [slugs, setSlugs] = useState<Set<string>>(() => new Set())

  /**
   * Settled from the session hint at first render, not left null for an effect to
   * fill in - a non-httpOnly cookie the middleware keeps agreeing with the real
   * token on every page (see lib/session-hint). Everyone the hint does not call a
   * customer is `false` immediately and makes no request; a customer is `null`,
   * unknown until the GET below brings their saves, so the header link does not
   * flash before it does. This is what stops a fully static, mostly anonymous
   * site from firing a dynamic, Payload-booting GET for readers who can never save.
   *
   * On the server the hint cannot be read and this is `false`, which renders the
   * signed-out view - the same view the client paints for a customer whose saves
   * have not arrived yet, so hydration matches either way.
   */
  const [signedIn, setSignedIn] = useState<boolean | null>(() =>
    sessionAudience() === 'customer' ? null : false,
  )

  useEffect(() => {
    // Non-customers were settled to `false` above and need nothing more; only a
    // customer makes the round trip, because the hint carries no slugs and the
    // hearts need the saved set. A hint that has drifted the wrong way is
    // corrected by the GET's own 401 (and the POST's).
    if (sessionAudience() !== 'customer') return

    let cancelled = false
    fetch('/save', { headers: { accept: 'application/json' } })
      .then(async (r) => {
        if (cancelled) return
        if (r.status === 401) {
          setSignedIn(false)
          return
        }
        if (!r.ok) return
        const data = (await r.json()) as { slugs?: string[] }
        setSignedIn(true)
        setSlugs(new Set(data.slugs ?? []))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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
            setSignedIn(false)
            flip(slug)
            goSignIn()
            return null
          }
          if (!r.ok) throw new Error(String(r.status))
          setSignedIn(true)
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
