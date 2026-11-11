import { GOVERNORATES } from '@vardenia/core/regions'
import { Link } from '../../i18n/routing'
import { LinkArrow } from '../LinkArrow'

/**
 * Edition geography comes from the supplied magazine entries, not invented map
 * pins. Every region goes by its own name; Keserwan is plain "Keserwan" (11
 * November 2026), no longer "Keserwan–Byblos".
 */
export function editionLabel(region: (typeof GOVERNORATES)[number], arabic: boolean) {
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
