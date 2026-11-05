import { GOVERNORATES } from '@vardenia/core'
import { Link } from '../../i18n/routing'
import { LinkArrow } from '../LinkArrow'

/** Edition geography comes from the supplied magazine entries, not invented map pins. */
export function editionLabel(region: (typeof GOVERNORATES)[number], arabic: boolean) {
  if (region.slug === 'keserwan') return arabic ? 'كسروان – جبيل' : 'Keserwan–Byblos'
  return arabic ? region.ar : region.en
}

export function EditionRegions({ title, arabic }: { title: string; arabic: boolean }) {
  return (
    <nav className="vd-edition-regions" aria-label={title}>
      <p>{title}</p>
      <ul>
        {GOVERNORATES.map((region) => (
          <li key={region.slug}>
            <Link href={`/directory?where=${region.slug}`}>
              {editionLabel(region, arabic)}{' '}
              <span aria-hidden>
                <LinkArrow />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
