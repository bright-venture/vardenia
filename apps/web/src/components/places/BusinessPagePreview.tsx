import { dirFor } from '@vardenia/i18n'
import { PageTemplateA } from './PageTemplateA'
import { PageTemplateB } from './PageTemplateB'
import { PageTemplateC } from './PageTemplateC'
import {
  PAGE_RATIO,
  defaultPreviewLabels,
  type PreviewData,
  type PreviewLabels,
  type PreviewTemplate,
} from './preview-model'

/**
 * A blank magazine page that fills in as the owner types.
 *
 * Purely presentational: the form (a client component) passes the data in.
 * The root is the layout container (`container-type: inline-size`), so the
 * templates size their type and spacing in `cqw` and the page scales as one
 * piece. The page shape is the `--page-ratio` variable, set from PAGE_RATIO.
 */
export function BusinessPagePreview({
  template,
  data,
  labels,
}: {
  template: PreviewTemplate
  data: PreviewData
  labels?: PreviewLabels
}) {
  const merged = { ...defaultPreviewLabels }
  for (const [key, value] of Object.entries(labels ?? {})) {
    if (value) merged[key as keyof typeof merged] = value
  }
  const Template = { a: PageTemplateA, b: PageTemplateB, c: PageTemplateC }[template]

  return (
    <div
      dir={dirFor(data.locale)}
      lang={data.locale}
      style={{ '--page-ratio': PAGE_RATIO } as React.CSSProperties}
      className="bg-surface-base text-ink-900 border-ink-100 font-body relative aspect-[var(--page-ratio)] w-full overflow-hidden border shadow-lg [container-type:inline-size]"
    >
      <Template data={data} labels={merged} />
    </div>
  )
}
