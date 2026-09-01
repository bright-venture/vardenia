import type { LucideIcon } from 'lucide-react'
import { Link } from '../../i18n/routing'

/**
 * One row inside a dropdown: icon, name, and a line saying what is behind it.
 *
 * The description is the part that earns the menu. "Lifestyle" and "Experiences"
 * are indistinguishable to somebody who has never used the site; "Shopping,
 * jewellery, fashion and beauty" is not.
 *
 * The icon tile is decorative and marked `aria-hidden` - a screen reader gets
 * the name and the description, which is the whole content. An icon announced as
 * "bed double" beside the word "Stay" is noise.
 */
export function MenuLink({
  href,
  title,
  description,
  icon: Icon,
}: {
  href: string
  title: string
  description?: string
  icon: LucideIcon
}) {
  return (
    <Link
      href={href}
      className="hover:bg-surface-sunken focus-visible:bg-surface-sunken flex items-start gap-3 p-2.5 transition-colors focus-visible:outline-none"
    >
      <span
        aria-hidden
        className="border-ink-100 bg-surface-raised text-gold-700 flex size-9 shrink-0 items-center justify-center border"
      >
        <Icon className="size-4" strokeWidth={1.5} />
      </span>

      <span className="flex flex-col">
        <span className="text-ink-900 text-sm font-medium">{title}</span>
        {description ? (
          <span className="text-ink-500 mt-0.5 text-xs leading-snug">{description}</span>
        ) : null}
      </span>
    </Link>
  )
}
