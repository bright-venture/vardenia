/** Geometry for a continuous flexible leaf, sampled into small, joined surface strips.
 * No PDF work happens here. The spine stays fixed and the sheet is flat at both ends.
 */
export const PAPER_TURN_MS = 960
export const PAPER_RETURN_MS = 280
export const clampProgress = (value: number) => Math.max(0, Math.min(1, value))

export interface PaperStrip {
  x: number
  y: number
  z: number
  angle: number
  shear: number
  shadeStart: number
  shadeEnd: number
  sourceIndex: number
}

export function paperGeometry(
  progress: number,
  width: number,
  height: number,
  direction: 1 | -1,
  grabY = 0.72,
  count = 36,
): PaperStrip[] {
  const p = clampProgress(progress)
  const flex = Math.sin(Math.PI * p)
  const stripWidth = width / count
  const theta = (u: number) => -Math.PI * p + flex * (-0.28 + 1.18 * u ** 1.65)
  const elevation = (u: number) => (clampProgress(grabY) - 0.5) * flex * height * 0.15 * u ** 1.5
  const shade = (angle: number) => Math.min(0.36, flex * (0.055 + 0.2 * Math.abs(Math.sin(angle))))
  const result: PaperStrip[] = []
  let x = 0,
    z = 0
  for (let i = 0; i < count; i++) {
    const u = i / count,
      v = (i + 1) / count
    const angle = theta((u + v) / 2)
    const endX = x + Math.cos(angle) * stripWidth
    const endZ = z - Math.sin(angle) * stripWidth
    const startY = elevation(u),
      endY = elevation(v)
    result.push({
      x: direction > 0 ? x : -endX,
      y: direction > 0 ? startY : endY,
      z: direction > 0 ? z : endZ,
      angle: direction > 0 ? angle : -angle,
      shear: (direction > 0 ? endY - startY : startY - endY) / stripWidth,
      shadeStart: shade(theta(direction > 0 ? u : v)),
      shadeEnd: shade(theta(direction > 0 ? v : u)),
      sourceIndex: direction > 0 ? i : count - 1 - i,
    })
    x = endX
    z = endZ
  }
  return result
}

export function dragProgress(
  startX: number,
  currentX: number,
  width: number,
  direction: 1 | -1,
): number {
  return clampProgress(((startX - currentX) * direction) / Math.max(1, width * 1.6))
}

export function shouldCommitTurn(progress: number, velocity: number, distance: number): boolean {
  return progress >= 0.34 || (velocity > 0.55 && distance > 36)
}
