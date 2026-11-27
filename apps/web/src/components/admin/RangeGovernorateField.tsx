'use client'

import { useEffect, useState } from 'react'
import { SelectField, useField, useFormFields } from '@payloadcms/ui'
import type { SelectFieldClientComponent } from 'payload'

/**
 * The governorate of a listing range.
 *
 * On an All Lebanon issue it is the usual choice. On an issue for one
 * governorate it is not a choice at all: the issue already names it, so it is
 * filled in from the issue and shown as plain text. The server takes it from
 * the issue too, so this is only the screen catching up.
 */
export const RangeGovernorateField: SelectFieldClientComponent = (props) => {
  const issue = useFormFields(([fields]) => fields.issue?.value) as unknown
  const { value, setValue } = useField<string | null>({ path: props.path })
  const [fixed, setFixed] = useState<string | null>(null)
  const issueId =
    typeof issue === 'number' || typeof issue === 'string'
      ? issue
      : issue && typeof issue === 'object' && 'id' in issue
        ? (issue as { id: number | string }).id
        : null

  useEffect(() => {
    if (issueId === null) return
    let live = true
    fetch(`/api/issues/${issueId}?depth=0`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((doc: { coverage?: string; governorate?: string } | null) => {
        if (!live) return
        const governorate =
          doc?.coverage === 'governorate' && typeof doc.governorate === 'string'
            ? doc.governorate
            : null
        setFixed(governorate)
        if (governorate && governorate !== value) setValue(governorate)
      })
      .catch(() => live && setFixed(null))
    return () => {
      live = false
    }
    // value/setValue are intentionally left out: this reacts to the issue only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId])

  if (fixed && issueId !== null) {
    const option = (props.field.options ?? []).find(
      (o) => (typeof o === 'string' ? o : o.value) === fixed,
    )
    const label = option && typeof option !== 'string' ? String(option.label) : fixed
    return (
      <div className="field-type">
        <label className="field-label">Governorate</label>
        <div>{label}</div>
        <div className="field-description">
          Taken from the issue; an issue for one governorate has only this one.
        </div>
      </div>
    )
  }
  return <SelectField {...props} />
}
