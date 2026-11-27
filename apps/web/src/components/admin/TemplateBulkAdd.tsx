'use client'

import { useMemo, useState } from 'react'
import { useForm, useFormFields } from '@payloadcms/ui'
import {
  PAGE_LAYOUTS,
  PAGE_LAYOUT_LABELS,
  isPageLayout,
  type PageLayout,
} from '@vardenia/core/page-layouts'
import { nextPage, planRange } from './template-pages'

/**
 * "Add several pages at once" under a template's page list: from page 1 to page
 * 10, all half pages, in one go. It only adds rows to the form (the same rows
 * "Add Page" adds, one at a time); nothing is saved until the template is, and
 * the server rebuilds the slots from the layouts either way.
 *
 * Hidden once a template is in use by an issue, which is when it is locked.
 */
export function TemplateBulkAdd({ path, schemaPath }: { path?: string; schemaPath?: string }) {
  const arrayPath = path ?? 'pages'
  const { addFieldRow } = useForm()
  const fields = useFormFields(([all]) => all)

  const layouts = useMemo(() => {
    const byIndex: (string | null)[] = []
    for (const [key, field] of Object.entries(fields ?? {})) {
      const match = new RegExp(`^${arrayPath}\\.(\\d+)\\.layout$`).exec(key)
      if (match) byIndex[Number(match[1])] = typeof field?.value === 'string' ? field.value : null
    }
    return Array.from(byIndex, (value) => value ?? null)
  }, [fields, arrayPath])

  const next = nextPage(layouts)
  const locked = fields?.locked?.value === true

  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')
  const [layout, setLayout] = useState<PageLayout>('half-page')
  const [message, setMessage] = useState<string | null>(null)

  if (locked) return null

  const fromValue = from === '' ? next : Number(from)

  const add = () => {
    const plan = planRange(layouts, fromValue, Number(to), layout)
    if (!plan.ok) {
      setMessage(plan.message)
      return
    }
    for (let i = 0; i < plan.count; i++) {
      addFieldRow({
        path: arrayPath,
        rowIndex: layouts.length + i,
        schemaPath: schemaPath ?? `templates.${arrayPath}`,
        subFieldState: { layout: { initialValue: layout, valid: true, value: layout } },
      })
    }
    setMessage(
      `Added ${plan.count} ${plan.count === 1 ? 'row' : 'rows'}: pages ${fromValue} to ${Number(to)}.`,
    )
    setFrom('')
    setTo('')
  }

  return (
    <div style={styles.box}>
      <p style={styles.title}>Add several pages at once</p>
      <div style={styles.row}>
        <label style={styles.label}>
          From page
          <input
            type="number"
            min={1}
            style={styles.input}
            value={from === '' ? String(next) : from}
            onChange={(e) => {
              setFrom(e.target.value)
              setMessage(null)
            }}
          />
        </label>
        <label style={styles.label}>
          To page
          <input
            type="number"
            min={1}
            style={styles.input}
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setMessage(null)
            }}
          />
        </label>
        <label style={styles.label}>
          Layout
          <select
            style={styles.input}
            value={layout}
            onChange={(e) => {
              if (isPageLayout(e.target.value)) setLayout(e.target.value)
              setMessage(null)
            }}
          >
            {PAGE_LAYOUTS.map((value) => (
              <option key={value} value={value}>
                {PAGE_LAYOUT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--style-secondary btn--size-small" onClick={add}>
          Add pages
        </button>
      </div>
      <p style={styles.hint}>
        The range continues where the template ends (next page: {next}). A full spread takes two
        pages, so 1 to 10 gives five spreads.
      </p>
      {message ? (
        <p role="status" style={styles.message}>
          {message}
        </p>
      ) : null}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  box: {
    marginTop: '0.75rem',
    padding: '0.75rem',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 4,
  },
  title: { margin: '0 0 0.5rem', fontWeight: 600 },
  row: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' },
  label: { display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8125rem' },
  input: { minWidth: '7rem', padding: '0.375rem 0.5rem' },
  hint: { margin: '0.5rem 0 0', fontSize: '0.8125rem', color: 'var(--theme-elevation-600)' },
  message: { margin: '0.5rem 0 0', fontSize: '0.8125rem', fontWeight: 600 },
}

export default TemplateBulkAdd
