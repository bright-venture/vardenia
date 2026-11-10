import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Browser code imports @vardenia/core by file, never the whole package.
 *
 * The package's main entry re-exports the form schemas, and with them Zod and
 * its language packs: 90 KB compressed. One browser-side import of the main
 * entry, reached through the header's discovery menu, put all of it on every
 * public page, the largest file a phone downloaded before the home page's
 * photograph (Lighthouse, 10 November 2026). `@vardenia/core/regions` and the
 * like load only the file named.
 *
 * Walks every 'use client' file and what it imports from this app, and fails
 * on any path that reaches the main entry. Type-only imports are free.
 */
const ROOT = path.resolve(__dirname, '..')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full)
  }
  return out
}

const files = sourceFiles(ROOT)
const text = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]))

const valueImports = (file: string) =>
  [
    ...text.get(file)!.matchAll(/(?:^|\n)\s*import\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/g),
  ].map((match) => match[1]!)

function resolveLocal(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = path.resolve(path.dirname(from), spec)
  for (const ending of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (text.has(base + ending)) return base + ending
  }
  return null
}

describe('browser code and @vardenia/core', () => {
  it('never imports the whole package, which would ship Zod to every page', () => {
    const clients = files.filter((file) => /^['"]use client['"]/.test(text.get(file)!.trimStart()))
    expect(clients.length).toBeGreaterThan(20)

    const offending: string[] = []
    for (const client of clients) {
      const seen = new Set<string>()
      const stack: string[][] = [[client]]
      while (stack.length) {
        const trail = stack.pop()!
        const file = trail.at(-1)!
        if (seen.has(file)) continue
        seen.add(file)
        for (const spec of valueImports(file)) {
          if (spec === '@vardenia/core') {
            offending.push(trail.map((f) => path.relative(ROOT, f)).join(' -> '))
          }
          const next = resolveLocal(file, spec)
          if (next) stack.push([...trail, next])
        }
      }
    }
    expect(offending).toEqual([])
  })
})
