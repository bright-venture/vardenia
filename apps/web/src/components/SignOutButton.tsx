'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '../i18n/routing'
import { SECONDARY_BUTTON } from './formStyles'

/**
 * Signing out.
 *
 * A button rather than a link, because signing out changes state on the server
 * and a GET that does that is a link any page - or any prefetcher - can follow
 * on the reader's behalf.
 *
 * `refresh` before `push` for the same reason as the login form: the page being
 * left is a server component holding this session's data, and without the
 * refresh Next serves it from the router cache with the bookings still on it.
 */
export function SignOutButton() {
  const t = useTranslations('account')
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function signOut() {
    setBusy(true)
    try {
      await fetch('/api/customers/logout', {
        method: 'POST',
        credentials: 'same-origin',
      })
    } finally {
      /**
       * The redirect happens whether or not the request succeeded. A failed
       * logout that leaves the reader staring at their own account page looks
       * like the button is broken; sending them to a page that re-reads the
       * session shows them the truth either way.
       */
      router.refresh()
      router.push('/account/login')
      setBusy(false)
    }
  }

  return (
    <button type="button" onClick={signOut} disabled={busy} className={SECONDARY_BUTTON}>
      {t('signOut')}
    </button>
  )
}
