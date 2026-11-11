import { LinkArrow } from '../LinkArrow'
import Image from 'next/image'
import { Link } from '../../i18n/routing'
export function MagazineArt({
  title,
  href = '/magazine',
  openLabel,
}: {
  title: string
  /** Null when the magazine's pages are hidden (lib/hidden-pages): no link. */
  href?: string | null
  openLabel: string
}) {
  const picture = (
    <figure>
      <Image
        src="/journey/vardenia-magazine-open-v1.webp"
        alt="Vardenia · Sama El Deir"
        width={1536}
        height={1024}
        sizes="(max-width:700px) 95vw, 55vw"
      />
    </figure>
  )
  return (
    <div className="vd-magazine-edition" data-vd-reveal>
      {href ? (
        <Link
          href={href}
          className="vd-magazine-art vd-magazine-product"
          aria-label={`${openLabel} · ${title}`}
        >
          {picture}
        </Link>
      ) : (
        <div className="vd-magazine-art vd-magazine-product">{picture}</div>
      )}
      <p dir="auto">{title}</p>
      {href ? (
        <Link href={href} className="vd-text-link">
          {openLabel} <LinkArrow />
        </Link>
      ) : null}
    </div>
  )
}
