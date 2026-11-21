import { ERROR_TEXT, HINT, INPUT, INPUT_ERROR, LABEL } from '../formStyles'

/**
 * One form field of the partner details and branch forms (Task 12a): label,
 * control, hint and the server's error, the error tied to the control by
 * aria-describedby so it is never colour alone. The control is rendered by
 * the caller with the props given, so an input, a select and a textarea all
 * get the same INPUT strings from formStyles.
 */
export function Field({
  fieldId,
  error,
  title,
  hint,
  children,
}: {
  fieldId: string
  error?: string
  title: string
  hint?: string
  children: (props: {
    id: string
    className: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
  }) => React.ReactNode
}) {
  const described = [hint ? `${fieldId}-hint` : null, error ? `${fieldId}-error` : null]
    .filter(Boolean)
    .join(' ')
  return (
    <div className="min-w-0">
      <label htmlFor={fieldId} className={LABEL}>
        {title}
      </label>
      {children({
        id: fieldId,
        className: `${INPUT} mt-1 ${error ? INPUT_ERROR : ''}`,
        ...(described ? { 'aria-describedby': described } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
      })}
      {hint ? (
        <p id={`${fieldId}-hint`} className={HINT}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${fieldId}-error`} className={ERROR_TEXT}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A group of checkboxes in its own fieldset, named by its legend, with its
 * hint and the server's error tied to the group by aria-describedby.
 */
export function CheckboxGroup({
  groupId,
  legend,
  hint,
  error,
  options,
}: {
  groupId: string
  legend: string
  hint?: string
  error?: string
  options: {
    value: string
    label: string
    checked: boolean
    disabled?: boolean
    onChange: (checked: boolean) => void
  }[]
}) {
  const described = [hint ? `${groupId}-hint` : null, error ? `${groupId}-error` : null]
    .filter(Boolean)
    .join(' ')
  return (
    <fieldset className="mt-5 min-w-0" {...(described ? { 'aria-describedby': described } : {})}>
      <legend className={LABEL}>{legend}</legend>
      {hint ? (
        <p id={`${groupId}-hint`} className={HINT}>
          {hint}
        </p>
      ) : null}
      <div className="mt-1 grid grid-cols-1 gap-x-5 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="text-ink-900 flex min-h-[44px] items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              checked={option.checked}
              disabled={option.disabled}
              onChange={(event) => option.onChange(event.target.checked)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${groupId}-error`} className={ERROR_TEXT}>
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}
