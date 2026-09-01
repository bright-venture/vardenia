import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * The shell every sign-in, sign-up, forgot and reset screen sits in.
 *
 * # Why a card, when nothing else on the site is one
 *
 * The rest of Vardenia is a magazine: full-bleed photographs, hairline rules,
 * type running to the measure. An auth screen is the one place that is not
 * reading - it is a short, bounded task with a single outcome, and a bordered
 * panel on a quiet ground is what says "this is the only thing on this page".
 * The pages it replaces were a bare heading and a stack of inputs floating in a
 * `max-w-md`, which read as an unfinished form rather than a door.
 *
 * # What was adapted from the reference, and what was not
 *
 * Taken: the centred card, the icon badge above the title, the one-line
 * subtitle, icons inside the fields.
 *
 * Not taken, and each for a reason worth keeping written down:
 *
 *  - The rounded corners, the sky-blue gradient, the drop shadow and the blue
 *    focus ring. Every panel and control on this site is a plain rectangle in
 *    the brand palette - see ui/Button, and lib/radius.test.ts, which fails the
 *    build if a radius comes back.
 *  - Sign in with Google, Facebook and Apple. There is no OAuth in this product
 *    and no plan for one in the file. Three buttons that do nothing is inventing
 *    a feature on the page where a reader is deciding whether to trust us. The
 *    logos also loaded from svgrepo.com, which the site's own
 *    `img-src 'self' data: blob:` policy blocks outright.
 *  - The gradient submit button, which was the one control the design filled
 *    with a colour that is not in the palette.
 *
 * # A server component
 *
 * It holds no state, so the interactive part stays confined to the form inside
 * it. That keeps the card, the heading and the subtitle out of the browser
 * bundle on four pages.
 */
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
    <main className="flex min-h-[70svh] items-center justify-center px-6 py-16 sm:py-20">
      <div className="border-ink-100 bg-surface-raised w-full max-w-md border p-8 sm:p-10">
        <div className="flex flex-col items-center text-center">
          {/*
            The badge is square with a hairline, like every other bounded thing
            on the site. `aria-hidden` because it is a picture of the page's own
            title - a screen reader announcing "log in image" before the heading
            "Sign in" says the same thing twice.
          */}
          <span
            aria-hidden
            className="border-ink-100 bg-surface-base text-gold-700 grid size-14 place-items-center border"
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
