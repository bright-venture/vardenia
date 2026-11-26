'use client'

import Link from 'next/link'
import { isEnglishRecovery, recoveryEditionScript } from '../../lib/recovery-edition'
import type { ReactNode } from 'react'
/** Standalone recovery screens work even when the normal layout cannot render. */
export function RecoveryView({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children: ReactNode
}) {
  return (
    <main
      className="vd-recovery"
      suppressHydrationWarning
      ref={(element) => {
        if (element)
          element.toggleAttribute(
            'data-english-recovery',
            isEnglishRecovery(window.location.pathname),
          )
      }}
    >
      <script dangerouslySetInnerHTML={{ __html: recoveryEditionScript }} />
      <div className="vd-recovery-copy">
        <Link className="vd-recovery-brand" href="/">
          Vardenia
        </Link>
        <h1>{title}</h1>
        <p>{body}</p>
        {children}
        <p className="vd-recovery-reference">
          <Link href="/credits">Photography credits</Link>
        </p>
      </div>
      <aside className="vd-recovery-photo" aria-hidden>
        <img src="/journey/byblos.webp" alt="" width={1600} height={1200} />
      </aside>
    </main>
  )
}
