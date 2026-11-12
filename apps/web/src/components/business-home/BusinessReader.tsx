'use client'

import Image from 'next/image'
import { MagazineReader } from '../magazine/MagazineReader'

/**
 * "Turn the pages": the designer's invitation (the cover mockup, the issue's
 * name, one button) in front of the site's own reader, which loads the PDF
 * only once the button is pressed.
 */
export function BusinessReader({
  src,
  originalSrc,
  title,
  heading,
  locale,
  copy,
}: {
  src: string
  originalSrc: string
  title: string
  heading: string
  locale: string
  copy: { coverAlt: string; open: string }
}) {
  return (
    <div className="vd-biz-reader-shell">
      <MagazineReader
        src={src}
        originalSrc={originalSrc}
        title={title}
        locale={locale}
        invitation={(open) => (
          <div className="vd-biz-invitation">
            <div className="vd-biz-invitation-body">
              <Image
                src="/business/cover-mockup.webp"
                width={769}
                height={934}
                alt={copy.coverAlt}
                sizes="(max-width:700px) 60vw, 360px"
              />
              <div>
                <h3 dir="auto">{heading}</h3>
                <button className="vd-biz-button" type="button" onClick={open}>
                  {copy.open}
                </button>
              </div>
            </div>
          </div>
        )}
      />
    </div>
  )
}
