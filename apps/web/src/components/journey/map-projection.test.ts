import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DESTINATIONS } from './destinations'
import { lebanonPath } from './map-path'
import { MAP_SIZE, projectMap, RELIEF_FRAME } from './map-projection'

describe('Lebanon map registration', () => {
  it('projects the original country geometry onto the displayed outline', () => {
    const geometry = JSON.parse(
      readFileSync(resolve('public/journey/lebanon-detailed.geojson'), 'utf8'),
    )
    const points = geometry.geometry.coordinates[0] as [number, number][]
    const displayed = [...lebanonPath.matchAll(/[ML]([\d.]+) ([\d.]+)/g)]
    expect(displayed).toHaveLength(points.length)
    points.forEach(([lon, lat], index) => {
      const projected = projectMap({ lat, lon })
      expect(Number(displayed[index]![1])).toBeCloseTo(projected.x, 2)
      expect(Number(displayed[index]![2])).toBeCloseTo(projected.y, 2)
    })
  })
  it('registers city coordinates identically on the relief image and vector map', () => {
    for (const place of DESTINATIONS) {
      // Geographic bounds published with the source raster, independent of its pixel dimensions.
      const fromRaster = {
        x: RELIEF_FRAME.x + ((place.lon - 34.8) / (36.9 - 34.8)) * RELIEF_FRAME.width,
        y: RELIEF_FRAME.y + ((34.9 - place.lat) / (34.9 - 32.8)) * RELIEF_FRAME.height,
      }
      const fromVector = projectMap(place)
      expect(fromRaster.x).toBeCloseTo(fromVector.x, 8)
      expect(fromRaster.y).toBeCloseTo(fromVector.y, 8)
      expect(fromVector.x).toBeGreaterThan(0)
      expect(fromVector.x).toBeLessThan(MAP_SIZE)
      expect(fromVector.y).toBeGreaterThan(0)
      expect(fromVector.y).toBeLessThan(MAP_SIZE)
    }
  })
})
