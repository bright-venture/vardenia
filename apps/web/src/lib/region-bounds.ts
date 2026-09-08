/**
 * The rectangle the directory map frames, and will not let the reader leave.
 *
 * The general map shows Lebanon and only Lebanon: no panning off into the sea or
 * into Syria, no zooming out to the whole Mediterranean. When a region filter is
 * on, the frame tightens to that governorate, so "Mount Lebanon" opens on a map
 * of Mount Lebanon rather than the whole country with two pins on it.
 *
 * These are framing boxes, not the surveyed borders. A governorate's real
 * outline is an irregular polygon; what the map needs is a bounding rectangle to
 * fit to and to clamp panning against, and a rectangle a little generous at the
 * edges reads better than a tight one that clips a coastal town. Precise outlines
 * would be GeoJSON and a different job; this is enough to point the map at the
 * right place.
 *
 * Each box is `[[south, west], [north, east]]`, the order Leaflet's
 * `latLngBounds` takes.
 */
export type Bounds = [[number, number], [number, number]]

/** The whole country, for the unfiltered map. */
export const LEBANON_BOUNDS: Bounds = [
  [33.03, 35.08],
  [34.7, 36.63],
]

/** Keyed by the governorate slugs the directory filters on (`?where=`). */
export const REGION_BOUNDS: Record<string, Bounds> = {
  beirut: [
    [33.86, 35.46],
    [33.92, 35.55],
  ],
  'mount-lebanon': [
    [33.6, 35.38],
    [34.15, 35.98],
  ],
  'north-lebanon': [
    [34.08, 35.58],
    [34.58, 36.25],
  ],
  akkar: [
    [34.38, 35.85],
    [34.7, 36.48],
  ],
  beqaa: [
    [33.38, 35.65],
    [34.08, 36.15],
  ],
  'baalbek-hermel': [
    [33.88, 35.9],
    [34.68, 36.63],
  ],
  'south-lebanon': [
    [33.03, 35.08],
    [33.62, 35.68],
  ],
  nabatieh: [
    [33.03, 35.3],
    [33.58, 35.85],
  ],
}

/** The box for a region filter, or the whole country when none is applied. */
export function boundsForRegion(governorate?: string | null): Bounds {
  return (governorate && REGION_BOUNDS[governorate]) || LEBANON_BOUNDS
}
