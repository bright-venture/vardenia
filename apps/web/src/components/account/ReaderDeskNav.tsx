import { Link } from '../../i18n/routing'

const destinations = [
  { href: '/account', label: 'title' },
  { href: '/account/passport', label: 'passportLink' },
  { href: '/account/saved', label: 'savedLink' },
  { href: '/account/receipts', label: 'receiptsLink' },
] as const

export function ReaderDeskNav({
  current,
  t,
}: {
  current: (typeof destinations)[number]['href']
  t: (key: (typeof destinations)[number]['label']) => string
}) {
  return (
    <nav hidden className="vd-reader-desk-nav" aria-label={t('title')}>
      {destinations.map(({ href, label }) => (
        <Link key={href} href={href} aria-current={href === current ? 'page' : undefined}>
          {t(label)}
        </Link>
      ))}
    </nav>
  )
}
