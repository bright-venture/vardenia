import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from '../../i18n/routing'

/**
 * The site's controls, in three weights.
 *
 * # Why the variants are these three
 *
 * `solid` is cedar and is the one thing on a page we are asking the reader to
 * do. One per screen; two solid buttons side by side means neither is the
 * answer. `outline` is the alternative that a reader might reasonably pick
 * instead. `ghost` is for a control that has to exist but should not compete -
 * "Clear filters", "Cancel".
 *
 * Gold is deliberately not a button fill. It is the accent that marks the
 * pressed and focused state, and the moment it becomes a 200px block it stops
 * reading as foil and starts reading as a warning.
 *
 * # Why there is a link version
 *
 * Half the controls on this site navigate. A `<button>` that pushes a route
 * cannot be opened in a new tab, cannot be copied, and is invisible to a
 * crawler - which matters here because every filtered directory view is meant
 * to be a shareable URL. `ButtonLink` uses the locale-aware `Link`, so it can
 * never drop the `/ar` prefix the way a raw anchor would.
 *
 * # Height
 *
 * 44px at `md` is the mobile tap target, not a coincidence. `sm` exists for
 * dense rows on desktop and is deliberately unavailable to the touch-sized
 * layouts by convention rather than by type.
 */

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45'

const VARIANTS = {
  solid: 'bg-cedar-900 text-surface-base hover:bg-cedar-700',
  outline: 'border border-ink-100 text-ink-900 hover:border-ink-300 hover:bg-surface-raised',
  ghost: 'text-ink-500 hover:text-ink-900 hover:bg-surface-sunken',
  /** Gold, for the one place a control has to feel like the brand: the masthead. */
  gold: 'bg-gold-500 text-cedar-900 hover:bg-gold-300',
} as const

const SIZES = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
} as const

export type ButtonVariant = keyof typeof VARIANTS
export type ButtonSize = keyof typeof SIZES

interface Common {
  variant?: ButtonVariant
  size?: ButtonSize
  full?: boolean
  className?: string
  children: ReactNode
}

const classesFor = ({ variant = 'solid', size = 'md', full, className = '' }: Common) =>
  `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${full ? 'w-full' : ''} ${className}`

export function Button({
  variant,
  size,
  full,
  className,
  children,
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={classesFor({ variant, size, full, className, children })} {...rest}>
      {children}
    </button>
  )
}

export function ButtonLink({
  href,
  variant,
  size,
  full,
  className,
  children,
  ...rest
}: Common & { href: string } & Omit<React.ComponentProps<typeof Link>, 'href' | 'className'>) {
  return (
    <Link
      href={href}
      className={classesFor({ variant, size, full, className, children })}
      {...rest}
    >
      {children}
    </Link>
  )
}
