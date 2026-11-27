/* Plain <img> on purpose: sources are browser object URLs (blob:), which next/image cannot optimise. */
/* eslint-disable @next/next/no-img-element */
import {
  NAME_MAX,
  TAGLINE_MAX,
  pageNumberLabel,
  previewText,
  type TemplateProps,
  A_LAYOUT,
} from './preview-model'

/**
 * Template A: a big photo on top, then name, tagline, rule and contact with a
 * decorative corner. Sizes are in `cqw` (percent of the page width) so
 * the whole page scales like a printed sheet at any preview width.
 *
 * Layout budget (cqw; page is 141.4 tall; numbers come from A_LAYOUT in
 * preview-model.ts and are asserted in its test). Worst input: 2-line name,
 * 2-line tagline, three contact lines, QR, page number. Hero 42% = 59.4,
 * leaving 82.0. Text block: padding 4.5 + category 3.9 + name 1.6+15.0 +
 * tagline 1+9.6 + rule 5.85 + contact 12 + bottom padding 7.0 (clears the page
 * number) = 60.4. No description (27 November 2026).
 */
export function PageTemplateA({ data, labels }: TemplateProps) {
  const name = previewText(data.name, labels.name, NAME_MAX)
  const tagline = previewText(data.tagline, labels.tagline, TAGLINE_MAX)
  const category = [data.category, data.governorate].filter(Boolean).join(' \u00b7 ')
  const meta = [data.address, data.hours].filter(Boolean)
  const ph = (on: boolean) => (on ? 'text-ink-500 italic' : '')

  return (
    <>
      <div
        className="bg-surface-sunken border-ink-300 relative border-b border-dashed"
        style={{ height: `${A_LAYOUT.heroPct}%` }}
      >
        {/* Plain img, not next/image: the source is a browser object URL (blob:). */}
        {data.heroUrl ? (
          <img src={data.heroUrl} alt={data.name} className="size-full object-cover" />
        ) : (
          <span className="text-ink-500 absolute inset-0 flex items-center justify-center text-[2.6cqw] uppercase tracking-[0.1em]">
            {labels.photo}
          </span>
        )}
      </div>
      <div className="px-[5cqw] pb-[7cqw] pt-[4.5cqw]">
        <p
          dir="auto"
          className={`text-gold-700 text-[2.6cqw] font-bold uppercase leading-[1.5] tracking-[0.18em] ${category ? '' : 'text-ink-500 italic'}`}
        >
          {category || labels.category}
        </p>
        <h2
          dir="auto"
          className={`font-display mt-[1.6cqw] line-clamp-2 text-[6.8cqw] font-bold leading-[1.1] ${ph(name.placeholder)}`}
        >
          {name.text}
        </h2>
        <p
          dir="auto"
          className={`font-display mt-[1cqw] line-clamp-2 text-[3.2cqw] italic leading-[1.5] ${tagline.placeholder ? 'text-ink-500' : 'text-gold-700'}`}
        >
          {tagline.text}
        </p>
        <div aria-hidden="true" className="bg-gold-700 my-[2.6cqw] h-[0.65cqw] w-[11cqw]" />
        <div className="flex items-end justify-between gap-[3cqw]">
          <div className="text-ink-500 min-w-0 text-[2.5cqw] leading-[1.6]">
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
            className="bg-surface-sunken border-ink-300 size-[11cqw] shrink-0 border"
          />
        </div>
      </div>
      <p
        className="text-ink-500 absolute bottom-[2.6cqw] start-[5cqw] text-[2.2cqw] font-medium tracking-[0.2em]"
        dir="ltr"
      >
        {pageNumberLabel(data.listingNumber)}
      </p>
    </>
  )
}
