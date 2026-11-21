import type { CollectionBeforeValidateHook } from 'payload'
import { pointFromMapsUrl } from '@vardenia/core'

/**
 * Fill a listing's `location` from the Google Maps link in `mapUrl`.
 *
 * Runs only when the write carries a link that differs from the saved one, so
 * a point set by hand stays put until the link itself is changed, and a save
 * that does not touch the link never moves the pin. A link with no coordinates
 * in it, a short link (maps.app.goo.gl, goo.gl/maps) and a link the field
 * validation will refuse all leave `location` as it was: a short link is kept
 * as it is and nobody opens it, because this never fetches the network.
 *
 * A link whose coordinates fall outside Lebanon is skipped here too (core
 * pointFromMapsUrl gives nothing for it), and the save is then refused by the
 * `mapUrl` field validation (core mapsUrlProblem: "That link points outside
 * Lebanon"), so the error appears on the box the editor pasted into rather
 * than on a location they never touched. Lebanon is the one rule for a point:
 * core isValidPoint, the `location` validation and the partner guard agree.
 *
 * beforeValidate, so the field's own point validation sees the filled value.
 * The order is Payload's: [longitude, latitude]. If one write changes the link
 * and also sends a different `location`, the link wins: the editor pasted it
 * last, and the pin must match the link a guest opens.
 */
export const fillLocationFromMapUrl: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  if (!data || typeof data.mapUrl !== 'string') return data
  // Stored trimmed, so a pasted trailing space is not kept.
  data.mapUrl = data.mapUrl.trim()
  const saved = (originalDoc as { mapUrl?: unknown } | undefined)?.mapUrl
  if (data.mapUrl === (typeof saved === 'string' ? saved.trim() : '')) return data

  const point = pointFromMapsUrl(data.mapUrl)
  if (point) data.location = point
  return data
}
