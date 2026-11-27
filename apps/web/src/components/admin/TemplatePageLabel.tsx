'use client'

import { useMemo } from 'react'
import { useFormFields, useRowLabel } from '@payloadcms/ui'
import { rowTitle } from './template-pages'

/**
 * A template page row titled by the pages it covers, "Page 3 · Half page" or
 * "Page 1→2 · Full spread", instead of "Page 01". The numbers follow the
 * layouts of the rows above, so a spread moves every later row by two.
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

  return <span>{rowTitle(layouts, rowNumber ?? 0)}</span>
}

export default TemplatePageLabel
