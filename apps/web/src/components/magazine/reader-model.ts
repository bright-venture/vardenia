export function spreadPages(page: number, total: number, spreads: boolean): number[] {
  if (!spreads || page === 1) return [page]
  const left = page % 2 === 0 ? page : page - 1
  return left + 1 <= total ? [left, left + 1] : [left]
}
export function nextPage(page: number, total: number, spreads: boolean, delta: number): number {
  const pages = spreadPages(page, total, spreads)
  const next = delta > 0 ? pages[pages.length - 1]! + 1 : pages[0]! - 1
  return Math.max(1, Math.min(total, next))
}
