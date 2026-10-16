import type { ReactNode } from 'react'
/** Opaque paper navigation remains readable over every page and photograph. */
export function HeaderBar({ children }: { children: ReactNode }) {
  return <header className="vd-header">{children}</header>
}
