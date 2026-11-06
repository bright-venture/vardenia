/**
 * Geometry for turning a magazine page: a page that folds, not one that spins.
 *
 * The first version rotated the page around the spine in 3D. Half way through
 * the page then pointed straight at the reader and shrank to a sliver: the
 * page "disappeared" in the middle of every turn. Paper does not do that.
 * A page under a finger folds: its corner lifts and travels across the spread,
 * the crease runs between where the corner was and where it is, and the part
 * past the crease shows its back.
 *
 * So this is the classic page fold, in the plane of the screen and visible at
 * every moment. Everything is in the turning page's own coordinates: the spine
 * at x = 0, the page across x in [0, width], y in [0, height]. The caller
 * mirrors it for a page turning the other way. No PDF work happens here.
 */
export const PAPER_TURN_MS = 1000
export const PAPER_RETURN_MS = 320
export const clampProgress = (value: number) => Math.max(0, Math.min(1, value))

export interface Point {
  x: number
  y: number
}

export interface PageFold {
  /** The corner being carried, where it started and where it is now. */
  from: Point
  corner: Point
  /** A point on the crease, and the crease's normal pointing at `from`. */
  crease: Point
  normal: Point
  /** What is still lying flat: the part of the page on the spine's side. */
  front: Point[]
  /** The part that has lifted, where it used to lie (now uncovered). */
  lifted: Point[]
  /** The lifted part folded over the crease: where its back is now seen. */
  flap: Point[]
  /** How far the flap reaches from the crease, for its shading. */
  flapDepth: number
}

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y
const length = (a: Point) => Math.hypot(a.x, a.y)

/** Reflects a point across the line through `crease` with unit normal `normal`. */
export function reflect(point: Point, crease: Point, normal: Point): Point {
  const d = dot(sub(point, crease), normal)
  return { x: point.x - 2 * d * normal.x, y: point.y - 2 * d * normal.y }
}

/** The part of a convex polygon on one side of a line: `side` > 0 keeps the normal's side. */
function clip(polygon: Point[], crease: Point, normal: Point, side: 1 | -1): Point[] {
  const inside = (p: Point) => side * dot(sub(p, crease), normal) >= 0
  const out: Point[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const ia = inside(a)
    const ib = inside(b)
    if (ia) out.push(a)
    if (ia !== ib) {
      const da = dot(sub(a, crease), normal)
      const db = dot(sub(b, crease), normal)
      const t = da / (da - db)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

/** Keeps `point` within `radius` of `centre`, on the line between them. */
function within(point: Point, centre: Point, radius: number): Point {
  const offset = sub(point, centre)
  const distance = length(offset)
  if (distance <= radius || distance === 0) return point
  return {
    x: centre.x + (offset.x * radius) / distance,
    y: centre.y + (offset.y * radius) / distance,
  }
}

/**
 * Where the page is at `progress` (0 flat, 1 turned).
 *
 * The corner nearest to where the reader took the page (bottom unless they
 * took it near the top) travels from its place across to the far side of the
 * spine, lifting on the way in a shallow arc, as a page does when it is carried
 * over. It is held to what paper allows: a page cannot stretch, so the corner
 * stays within a page's width of the spine on its own edge and within the
 * diagonal of the far spine corner. That keeps the crease on the page and
 * stops it ever tearing from the spine.
 */
export function pageFold(progress: number, width: number, height: number, grabY = 0.72): PageFold {
  const p = clampProgress(progress)
  const bottom = clampProgress(grabY) >= 0.5
  const edgeY = bottom ? height : 0
  const from: Point = { x: width, y: edgeY }
  const rect: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
  // Lifts most in the middle of the turn; more when the page was taken higher.
  const lift = height * (0.1 + 0.12 * Math.abs(clampProgress(grabY) - (bottom ? 1 : 0)))
  let corner: Point = {
    x: width - 2 * width * p,
    y: edgeY + (bottom ? -1 : 1) * lift * Math.sin(Math.PI * p),
  }
  corner = within(corner, { x: 0, y: edgeY }, width)
  corner = within(corner, { x: 0, y: height - edgeY }, Math.hypot(width, height))

  const toFrom = sub(from, corner)
  const span = length(toFrom)
  if (span < 0.5) {
    return {
      from,
      corner: from,
      crease: from,
      normal: { x: 1, y: 0 },
      front: rect,
      lifted: [],
      flap: [],
      flapDepth: 0,
    }
  }
  const normal = { x: toFrom.x / span, y: toFrom.y / span }
  const crease = { x: (from.x + corner.x) / 2, y: (from.y + corner.y) / 2 }
  const front = clip(rect, crease, normal, -1)
  const lifted = clip(rect, crease, normal, 1)
  const flap = lifted.map((point) => reflect(point, crease, normal))
  const flapDepth = flap.reduce(
    (deepest, point) => Math.max(deepest, -dot(sub(point, crease), normal)),
    0,
  )
  return { from, corner, crease, normal, front, lifted, flap, flapDepth }
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
