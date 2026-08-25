'use client'

import { useSyncExternalStore } from 'react'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import { sessionAudience } from '../lib/session-hint'

/**
 * "Sign in" and "Sign up" to a visitor, "Your account" to a customer.
 *
 * The header used to say "Your account" to everybody, which reads as though the
 * site assumes you already have one. Every other site offers a way in before it
 * offers a way back.
 *
 * # A client component so the pages stay static
 *
 * Deciding this on the server means reading the session, and reading the session
 * makes every page dynamic - see lib/session-hint. Instead the label is chosen
 * in the browser from a cookie that says only whether a session exists, so the
 * whole site is still prerendered.
 *
 * # Signed out is the initial state on purpose
 *
 * The server has no way to know, so it renders the signed-out links and the
 * browser corrects them. Most people arriving from a printed code or a search
 * result have no account, so the common case is right with nothing to correct.
 *
 * # `useSyncExternalStore` rather than an effect
 *
 * A cookie is external state, which is exactly what this hook is for - and
 * reading it in an effect is a cascading render the React compiler refuses to
 * build. It also buys something real: subscribing to `visibilitychange` means
 * signing out in one tab fixes the header in the others when they are looked at
 * again, instead of offering an account that is no longer there.
 */

const subscribe = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange)
  window.addEventListener('focus', onChange)
  return () => {
    document.removeEventListener('visibilitychange', onChange)
    window.removeEventListener('focus', onChange)
  }
}

export function AccountLink({ locale }: { locale: Locale }) {
  const ar = locale === 'ar'

  // Third argument is the server snapshot: nothing is known there, so the
  // signed-out links are what gets prerendered.
  const audience = useSyncExternalStore(subscribe, sessionAudience, () => null)

  if (audience === 'customer') {
    return (
      <Link href="/account" className="text-ink-700 hover:text-ink-900 transition-colors">
        {ar ? 'حسابك' : 'Your account'}
      </Link>
    )
  }

  /**
   * A partner is signed in, but not to anything at /account - their bookings
   * live at /partner. Sending them to the customer page would show them a sign
   * in prompt while they hold a valid session, which is the contradiction this
   * whole component exists to avoid.
   *
   * The words are `partner.title` from the message catalogue rather than
   * something new, so the link names the page it opens.
   */
  if (audience === 'partner') {
    return (
      <Link href="/partner" className="text-ink-700 hover:text-ink-900 transition-colors">
        {ar ? 'حجوزاتك' : 'Your bookings'}
      </Link>
    )
  }

  return (
    <span className="flex items-center gap-3">
      <Link href="/account/login" className="text-ink-700 hover:text-ink-900 transition-colors">
        {ar ? 'تسجيل الدخول' : 'Sign in'}
      </Link>
      {/* The one deliberately solid control in the header. Opening an account is
          the only thing here we are asking a reader to do, rather than offering. */}
      <Link
        href="/account/signup"
        className="bg-ink-900 text-surface-base rounded-full px-3 py-1.5 text-sm transition-opacity hover:opacity-90"
      >
        {ar ? 'إنشاء حساب' : 'Sign up'}
      </Link>
    </span>
  )
}
