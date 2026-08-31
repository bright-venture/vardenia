'use client'

import { useEffect, useId, useImperativeHandle, useRef } from 'react'

/**
 * The Turnstile widget, or nothing at all.
 *
 * # Nothing at all, until a site key exists
 *
 * With no `NEXT_PUBLIC_TURNSTILE_SITE_KEY` this renders null and loads no
 * script, which is what lets the whole feature ship dark: merged, deployed and
 * inert until somebody creates a Cloudflare account. The server half agrees -
 * `lib/turnstile` skips verification with no secret - so the two switches are
 * off together and neither can half-enable the other.
 *
 * The two keys are separate on purpose. The site key is public and only decides
 * whether a widget is drawn; the secret decides whether a token is checked. If
 * only the site key were set the form would show a challenge nothing verifies,
 * which is worse than showing none, so the dashboard warning in lib/turnstile
 * keys off the secret rather than this.
 *
 * # Explicit rendering rather than the automatic class
 *
 * Cloudflare's script will find `.cf-turnstile` elements itself, but only those
 * present when it loads. This form is a client component that can mount after
 * the script has already run - a reader who lands on the account page from a
 * link rather than a cold load - and the automatic path silently draws nothing
 * in that case. Calling `render` when both the script and the element are ready
 * is the only ordering that works in both.
 *
 * # It reports the token upward rather than owning it
 *
 * The form needs the token in its request body, and the widget needs to be
 * resettable when the server refuses. So the token goes up through `onToken`
 * and the reset comes back down through a ref, rather than this component
 * knowing anything about sign-up.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
          theme?: 'light' | 'dark' | 'auto'
          language?: string
        },
      ) => string
      reset: (id?: string) => void
    }
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const SCRIPT_ID = 'cf-turnstile-script'

export interface TurnstileHandle {
  reset: () => void
}

export function Turnstile({
  onToken,
  handle,
  locale,
  siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
}: {
  onToken: (token: string | null) => void
  handle?: React.MutableRefObject<TurnstileHandle | null>
  locale?: string
  siteKey?: string
}) {
  const container = useRef<HTMLDivElement | null>(null)
  const widgetId = useRef<string | null>(null)
  const id = useId()

  /**
   * Exposed through useImperativeHandle rather than by assigning to the ref
   * inside an effect. Assigning directly works, and React's linter is right to
   * object: the ref is a prop this component does not own, and writing to it
   * during an effect is a mutation the parent cannot see coming.
   */
  useImperativeHandle(
    handle,
    () => ({
      reset: () => {
        onToken(null)
        window.turnstile?.reset(widgetId.current ?? undefined)
      },
    }),
    [onToken],
  )

  /**
   * One effect, not two.
   *
   * The first draft loaded the script in one effect, recorded "ready" in state,
   * and rendered the widget in a second effect keyed on it. That calls setState
   * synchronously inside an effect whenever the script is already present,
   * which cascades renders for no reason - React's own guidance, and the
   * linter's complaint.
   *
   * Loading a script and drawing into a div are both synchronisation with an
   * external system, so they belong in the same effect and need no React state
   * between them. `mounted` guards the case where the reader navigates away
   * before Cloudflare answers.
   */
  useEffect(() => {
    if (!siteKey) return

    let mounted = true

    const draw = () => {
      if (!mounted || !container.current || widgetId.current) return
      widgetId.current =
        window.turnstile?.render(container.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          // A token is good for five minutes. Clearing it on expiry means a form
          // left open does not submit something the server will refuse.
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
          theme: 'auto',
          language: locale === 'ar' ? 'ar' : 'en',
        }) ?? null
    }

    if (window.turnstile) {
      draw()
      return () => {
        mounted = false
      }
    }

    // One script for the page, however many widgets. Appending it twice makes
    // Cloudflare warn and can draw the widget twice.
    const existing = document.getElementById(SCRIPT_ID)
    const script = existing ?? document.createElement('script')

    script.addEventListener('load', draw)

    if (!existing) {
      script.id = SCRIPT_ID
      ;(script as HTMLScriptElement).src = SCRIPT_SRC
      ;(script as HTMLScriptElement).async = true
      ;(script as HTMLScriptElement).defer = true
      document.head.appendChild(script)
    }

    return () => {
      mounted = false
      script.removeEventListener('load', draw)
    }
  }, [siteKey, onToken, locale])

  if (!siteKey) return null

  return <div ref={container} id={`turnstile-${id}`} className="mt-4" />
}

/** Whether a widget will be drawn, so a form can decide what to require. */
export function isTurnstileEnabled(siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY): boolean {
  return Boolean(siteKey?.trim())
}
