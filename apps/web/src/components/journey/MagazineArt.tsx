import Image from 'next/image'
import { Link } from '../../i18n/routing'
export function MagazineArt({
  title,
  href = '/magazine',
  openLabel,
}: {
  title: string
  href?: string
  openLabel: string
}) {
  return (
    <div className="vd-magazine-edition" data-vd-reveal>
      <Link
        href={href}
        className="vd-magazine-art vd-magazine-product"
        aria-label={`${openLabel} · ${title}`}
      >
        <figure>
          <Image
            src="/journey/vardenia-magazine-open-v1.webp"
            alt="Vardenia · Sama El Deir"
            width={1536}
            height={1024}
            sizes="(max-width:700px) 95vw, 55vw"
          />
        </figure>
      </Link>
      <p dir="auto">{title}</p>
      <Link href={href} className="vd-text-link">
        {openLabel} ↗
      </Link>
    </div>
  )
}
