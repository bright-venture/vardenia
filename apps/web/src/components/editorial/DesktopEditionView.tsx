import type { ReactNode } from 'react'

/** Switch server-rendered content when the English desktop edition is active. */
export function DesktopEditionView({
  locale,
  desktop,
  children,
}: {
  locale: string
  desktop: ReactNode
  children: ReactNode
}) {
  if (locale !== 'en') return children

  return (
    <>
      <div className="vd-edition-wide">{desktop}</div>
      <div className="vd-edition-small">{children}</div>
    </>
  )
}
