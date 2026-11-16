import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A page an admin can hide that also reads the query string must say it is
 * rendered per request.
 *
 * Otherwise a build made while the page is hidden stops at `notFoundIfHidden`
 * before `searchParams` is read, Next files the page as static, and unhiding it
 * fails every request with DYNAMIC_SERVER_USAGE. /magazine/articles answered
 * 500 that way on 16 November 2026, after the Articles page was unhidden on
 * the live site.
 */

const ROOT = path.join(__dirname, '(frontend)')

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return pages(full)
    return name === 'page.tsx' ? [full] : []
  })
}

const risky = pages(ROOT).filter((file) => {
  const source = readFileSync(file, 'utf8')
  return source.includes('notFoundIfHidden(') && /\bsearchParams\b/.test(source)
})

describe('hideable pages that read the query string', () => {
  it('finds the pages it is guarding', () => {
    // The directory, the sections and the article index, at least.
    expect(risky.length).toBeGreaterThanOrEqual(3)
  })

  it.each(risky.map((file) => [path.relative(ROOT, file), file]))(
    '%s is declared dynamic',
    (_name, file) => {
      expect(readFileSync(file, 'utf8')).toMatch(/export const dynamic = 'force-dynamic'/)
    },
  )
})
