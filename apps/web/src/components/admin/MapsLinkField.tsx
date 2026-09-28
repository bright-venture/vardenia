'use client'

import { useState } from 'react'
import { useField } from '@payloadcms/ui'
import { isWithinLebanon } from '@vardenia/core'
import { parseMapsLink } from '../../lib/maps-paste'

/**
 * "Paste a Google Maps link" above a listing's location.
 *
 * Fills the point field underneath, in the order Payload stores it
 * ([longitude, latitude]), so nobody types either number or decides which box
 * is which. A point outside Lebanon is refused here, with the same bounds the
 * field's own validation uses, rather than accepted and refused on save.
 */

const NOTES = {
  'short-link':
    'Short links (maps.app.goo.gl) cannot be read. Open the link, then copy the full address from the browser bar and paste that.',
  'no-coordinates':
    'No coordinates found. Paste the address from the browser bar while the place is open in Google Maps, or right-click the spot and copy the numbers.',
  outside: 'That point is outside Lebanon. Check it is the right place.',
}

export function MapsLinkField() {
  const { value, setValue } = useField<[number, number] | null>({ path: 'location' })
  const [text, setText] = useState('')
  const [note, setNote] = useState<string | null>(null)

  const current =
    Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number'
      ? { lng: value[0], lat: value[1] }
      : null

  function apply() {
    const result = parseMapsLink(text)
    if (!result.ok) return setNote(NOTES[result.reason])
    if (!isWithinLebanon(result.lat, result.lng)) return setNote(NOTES.outside)
    setValue([result.lng, result.lat])
    setText('')
    setNote(null)
  }

  return (
    <div className="vd-maps">
      <label className="vd-booking__reason">
        <span>Paste a Google Maps link to set the location</span>
        <div className="vd-maps__row">
          <input
            type="text"
            value={text}
            placeholder="https://www.google.com/maps/place/..."
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                apply()
              }
            }}
          />
          <button type="button" className="vd-choice" disabled={!text.trim()} onClick={apply}>
            Use this location
          </button>
        </div>
      </label>
      {note ? <p className="vd-warn">{note}</p> : null}
      {current ? (
        <p className="vd-muted">
          Set to {current.lat.toFixed(5)}, {current.lng.toFixed(5)}.{' '}
          <a
            href={`https://www.google.com/maps?q=${current.lat},${current.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Check it on Google Maps
          </a>
        </p>
      ) : (
        <p className="vd-muted">
          No location yet: the listing has no directions or &ldquo;near me&rdquo;.
        </p>
      )}
    </div>
  )
}

export default MapsLinkField
