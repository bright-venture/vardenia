'use client'

import { useRowLabel } from '@payloadcms/ui'

/**
 * An opening-hours row titled by what it says, "Monday · 09:00 to 23:00",
 * instead of "Opening Hour 01", so a week can be read with every row closed.
 */

const NAMES: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

interface Row {
  day?: string | null
  opens?: string | null
  closes?: string | null
  closed?: boolean | null
}

export function OpeningHourLabel() {
  const { data, rowNumber } = useRowLabel<Row>()
  const day = data?.day ? NAMES[data.day] : `Day ${(rowNumber ?? 0) + 1}`
  const hours = data?.closed
    ? 'closed'
    : data?.opens || data?.closes
      ? `${data.opens || '?'} to ${data.closes || '?'}`
      : 'no hours yet'
  return (
    <span>
      {day} · {hours}
    </span>
  )
}

export default OpeningHourLabel
