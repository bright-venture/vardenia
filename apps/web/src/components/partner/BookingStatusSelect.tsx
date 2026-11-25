'use client'

import { useRouter } from '../../i18n/routing'

export function BookingStatusSelect({
  value,
  options,
}: {
  value: string
  options: { value: string; label: string }[]
}) {
  const router = useRouter()
  return (
    <label hidden className="vd-booking-status-select">
      Status
      <select
        value={value}
        onChange={(event) => router.push(event.target.value, { scroll: false })}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
