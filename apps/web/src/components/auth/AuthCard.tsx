import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Shared photographic shell; existing forms own authentication and validation. */
export function AuthCard({
  icon: Icon,
  title,
  subtitle,
  eyebrow,
  children,
}: {
  /** A lucide icon, drawn in the badge above the title. */
  icon: LucideIcon
  title: string
  /** One line on what this account is for. */
  subtitle?: string
  /** Used by the partner screens, which have to say who they are for. */
  eyebrow?: string
  children: ReactNode
}) {
  return (
    <main className="vd-auth">
      <aside className="vd-auth-image" aria-hidden>
        <img src="/journey/byblos.webp" alt="" width="1600" height="1200" loading="lazy" />
        <span>Vardenia</span>
      </aside>
      <div className="vd-auth-card">
        <div className="vd-auth-heading flex flex-col items-center text-center">
          {/*
            The badge is square with a hairline, like every other bounded thing
            on the site. `aria-hidden` because it is a picture of the page's own
            title - a screen reader announcing "log in image" before the heading
            "Sign in" says the same thing twice.
          */}
          <span
            aria-hidden
            className="vd-auth-icon border-ink-100 bg-surface-base text-gold-700 grid size-14 place-items-center border"
          >
            <Icon className="size-6" strokeWidth={1.5} />
          </span>

          {eyebrow ? (
            <p className="text-gold-700 mt-6 font-mono text-[11px] uppercase tracking-[0.16em]">
              {eyebrow}
            </p>
          ) : null}

          <h1 className={`text-ink-900 text-3xl ${eyebrow ? 'mt-2' : 'mt-6'}`}>{title}</h1>

          {subtitle ? (
            <p className="text-ink-500 mt-3 max-w-[34ch] text-sm leading-relaxed">{subtitle}</p>
          ) : null}
        </div>

        <div className="mt-8">{children}</div>
      </div>
    </main>
  )
}
