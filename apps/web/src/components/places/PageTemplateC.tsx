/* Plain <img> on purpose: sources are browser object URLs (blob:), which next/image cannot optimise. */
/* eslint-disable @next/next/no-img-element */
import { NAME_MAX, pageNumberLabel, previewText, type TemplateProps } from './preview-model'

/**
 * Template C: one full-page photo with a dark text band at the bottom. The band
 * is the navy token ground, so its text uses light tokens. Sizes in `cqw`.
 *
 * Layout budget (cqw, from C_LAYOUT in preview-model.ts, asserted in its test):
 * the band is 4.5 + 3.9 + 1.6+15.5 (2-line name) + 5.85 + 12 + 6.6 (clears
 * the page number) = 49.9, held under 50% of the page (70.7) so the photo stays
 * the main thing. No description (27 November 2026).
 */
export function PageTemplateC({ data, labels }: TemplateProps) {
  const name = previewText(data.name, labels.name, NAME_MAX)
  const category = [data.category, data.governorate].filter(Boolean).join(' \u00b7 ')
  const meta = [data.address, data.hours].filter(Boolean)

  return (
    <>
      <div className="bg-cedar-700 absolute inset-0">
        {/* Plain img, not next/image: the source is a browser object URL (blob:). */}
        {data.heroUrl ? (
          <img src={data.heroUrl} alt={data.name} className="size-full object-cover" />
        ) : (
          <span className="text-ink-100 absolute inset-x-0 top-[30%] flex justify-center text-[2.6cqw] uppercase tracking-[0.1em]">
            {labels.photo}
          </span>
        )}
      </div>

      <div className="bg-surface-inverse/90 text-surface-base absolute inset-x-0 bottom-0 px-[5cqw] pb-[6.6cqw] pt-[4.5cqw]">
        <p
          dir="auto"
          className={`text-[2.6cqw] font-bold uppercase leading-[1.5] tracking-[0.18em] ${category ? 'text-gold-300' : 'text-ink-100 italic'}`}
        >
          {category || labels.category}
        </p>
        <h2
          dir="auto"
          className={`font-display mt-[1.6cqw] line-clamp-2 text-[7.4cqw] font-bold leading-[1.05] ${name.placeholder ? 'text-ink-100 italic' : ''}`}
        >
          {name.text}
        </h2>
        <div aria-hidden="true" className="bg-gold-300 my-[2.6cqw] h-[0.65cqw] w-[11cqw]" />
        <div className="flex items-end justify-between gap-[3cqw]">
          <div className="text-ink-100 min-w-0 text-[2.5cqw] leading-[1.6]">
            {meta.length > 0 ? (
              meta.map((line) => (
                <p key={line} dir="auto" className="truncate">
                  {line}
                </p>
              ))
            ) : (
              <p className="italic">{labels.address}</p>
            )}
            {data.phone ? (
              <p>
                <bdi dir="ltr">{data.phone}</bdi>
              </p>
            ) : (
              <p className="italic">{labels.phone}</p>
            )}
          </div>
          <div
            aria-hidden="true"
            className="border-ink-300 bg-cedar-700 size-[11cqw] shrink-0 border"
          />
        </div>
      </div>

      <p
        dir="ltr"
        className="text-ink-100 absolute bottom-[2cqw] end-[5cqw] text-[2.2cqw] font-medium tracking-[0.2em]"
      >
        {pageNumberLabel(data.listingNumber)}
      </p>
    </>
  )
}
