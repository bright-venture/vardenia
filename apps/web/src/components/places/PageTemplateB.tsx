/* Plain <img> on purpose: sources are browser object URLs (blob:), which next/image cannot optimise. */
/* eslint-disable @next/next/no-img-element */
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  pageNumberLabel,
  previewText,
  type TemplateProps,
  B_LAYOUT,
  clampStyle,
} from './preview-model'

/**
 * Template B: title, one main photo beside the text, three small gallery
 * photos, then amenities and contact. Sizes in `cqw`, see PageTemplateA.
 *
 * Layout budget (cqw, from B_LAYOUT in preview-model.ts, asserted in its test):
 * head 5+3.9+1.8+15.1 (2-line name)+5.85 = 31.7; photo row 48 (the 11-line
 * body is 45.4, so it fits beside the photo); gallery 3.2+17; foot 3.2+12+7.
 * Total 122.1 of 141.4.
 */
export function PageTemplateB({ data, labels }: TemplateProps) {
  const name = previewText(data.name, labels.name, NAME_MAX)
  const body = previewText(data.description, labels.description, DESCRIPTION_MAX)
  const category = [data.category, data.governorate].filter(Boolean).join(' \u00b7 ')
  // Always three slots, filled in order, so the row keeps its shape while typing.
  const gallery = [0, 1, 2].map((i) => data.galleryUrls[i])
  const amenities = data.amenities.filter(Boolean).slice(0, 6)
  const slot = 'bg-surface-sunken border-ink-300 relative border border-dashed'
  const empty = 'text-ink-500 absolute inset-0 flex items-center justify-center text-[2.2cqw]'

  return (
    <>
      <div className="px-[5cqw] pt-[5cqw]">
        <p
          dir="auto"
          className={`text-[2.6cqw] font-bold uppercase leading-[1.5] tracking-[0.18em] ${category ? 'text-gold-700' : 'text-ink-500 italic'}`}
        >
          {category || labels.category}
        </p>
        <h2
          dir="auto"
          className={`font-display mt-[1.8cqw] line-clamp-2 text-[7cqw] font-bold leading-[1.08] ${name.placeholder ? 'text-ink-500 italic' : ''}`}
        >
          {name.text}
        </h2>
        <div aria-hidden="true" className="bg-gold-700 my-[2.6cqw] h-[0.65cqw] w-[11cqw]" />
      </div>

      <div className="flex gap-[3.2cqw] px-[5cqw]">
        <div
          className={`${slot} w-[46%] shrink-0`}
          style={{ height: `${B_LAYOUT.photoHeight}cqw` }}
        >
          {/* Plain img, not next/image: the source is a browser object URL (blob:). */}
          {data.heroUrl ? (
            <img src={data.heroUrl} alt={data.name} className="size-full object-cover" />
          ) : (
            <span className={empty}>{labels.photo}</span>
          )}
        </div>
        <p
          dir="auto"
          style={clampStyle(B_LAYOUT.bodyLines)}
          className={`min-w-0 flex-1 text-[2.66cqw] leading-[1.55] ${body.placeholder ? 'text-ink-500 italic' : 'text-ink-700'}`}
        >
          {body.text}
        </p>
      </div>

      <div className="flex gap-[2cqw] px-[5cqw] pt-[3.2cqw]">
        {gallery.map((url, i) => (
          <div
            key={i}
            className={`${slot} flex-1`}
            style={{ height: `${B_LAYOUT.galleryHeight}cqw` }}
          >
            {url ? (
              <img src={url} alt={data.name} className="size-full object-cover" />
            ) : (
              <span className={empty}>{i + 2}</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-end justify-between gap-[3cqw] px-[5cqw] pb-[7cqw] pt-[3.2cqw]">
        <div className="text-ink-500 min-w-0 text-[2.5cqw] leading-[1.6]">
          <p
            dir="auto"
            className={`truncate ${amenities.length ? 'text-ink-900 font-bold' : 'italic'}`}
          >
            {amenities.length ? amenities.join(' \u00b7 ') : labels.amenities}
          </p>
          <p dir="auto" className={`truncate ${data.address ? '' : 'italic'}`}>
            {data.address || labels.address}
          </p>
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

      <p
        dir="ltr"
        className="text-ink-500 absolute bottom-[2.6cqw] end-[5cqw] text-[2.2cqw] font-medium tracking-[0.2em]"
      >
        {pageNumberLabel(data.listingNumber)}
      </p>
    </>
  )
}
