'use client'

import { useMemo } from 'react'
import { useFormFields, useRowLabel } from '@payloadcms/ui'
import { rowTitle } from './template-pages'

/**
 * A template page row titled by the pages it covers, "Page 3 · Half page",
 * "Page 1→2 · Full spread" or "Page 1 · No listings (Cover)", instead of
 * "Page 01". The numbers follow the layouts of the rows above, so a spread
 * moves every later row by two and a page without listings by one.
 */
export function TemplatePageLabel() {
  const { rowNumber } = useRowLabel<{ layout?: string | null }>()
  const fields = useFormFields(([all]) => all)
  const layouts = useMemo(() => {
    const byIndex: (string | null)[] = []
    for (const [path, field] of Object.entries(fields ?? {})) {
      const match = /^pages\.(\d+)\.layout$/.exec(path)
      if (match) byIndex[Number(match[1])] = typeof field?.value === 'string' ? field.value : null
    }
    return Array.from(byIndex, (value) => value ?? null)
  }, [fields])

  // Read from the form like the layouts, so the title follows the note as it is typed.
  const note = fields?.[`pages.${rowNumber ?? 0}.note`]?.value
  return <span>{rowTitle(layouts, rowNumber ?? 0, typeof note === 'string' ? note : null)}</span>
}

export default TemplatePageLabel
