/** Shared equirectangular projection for Natural Earth, relief pixels and city markers. */
export const MAP_SIZE = 680
export function projectMap({ lat, lon }: { lat: number; lon: number }) {
  return { x: (lon - 35.05) * 310 + 85, y: (34.7 - lat) * 365 + 30 }
}
export function mapPosition(place: { lat: number; lon: number }) {
  const point = projectMap(place)
  return { x: (point.x / MAP_SIZE) * 100, y: (point.y / MAP_SIZE) * 100 }
}
// Dr Brains's source image is equirectangular, bounded by these published coordinates:
// https://commons.wikimedia.org/wiki/File:Lebanon_topographical_map.png
const northWest = projectMap({ lat: 34.9, lon: 34.8 })
const southEast = projectMap({ lat: 32.8, lon: 36.9 })
export const RELIEF_FRAME = {
  x: northWest.x,
  y: northWest.y,
  width: southEast.x - northWest.x,
  height: southEast.y - northWest.y,
}
