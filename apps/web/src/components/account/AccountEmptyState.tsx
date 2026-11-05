import { Bookmark, CalendarDays, FileText, ScanLine } from 'lucide-react'
import { Link } from '../../i18n/routing'
import { PRIMARY_BUTTON } from '../formStyles'

const icons = { saved: Bookmark, bookings: CalendarDays, receipts: FileText, scans: ScanLine }

/** Quiet, consistent first-use and filtered-empty states. Copy comes from the caller's locale. */
export function AccountEmptyState({
  kind,
  message,
  action,
}: {
  kind: keyof typeof icons
  message: string
  action?: { href: string; label: string }
}) {
  const Icon = icons[kind]
  return (
    <div className="border-ink-100 bg-surface-raised mt-8 flex flex-col items-start gap-5 border p-6 sm:flex-row sm:gap-6 sm:p-8">
      <span
        className="border-gold-300 bg-gold-100/40 text-cedar-900 inline-flex size-12 shrink-0 items-center justify-center border"
        aria-hidden="true"
      >
        <Icon className="size-5" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 max-w-prose">
        <p className="text-ink-700 break-words text-base leading-relaxed">{message}</p>
        {action ? (
          <Link href={action.href} className={`${PRIMARY_BUTTON} mt-5 min-h-11 text-center`}>
            {action.label}
          </Link>
        ) : null}
      </div>
    </div>
  )
}
