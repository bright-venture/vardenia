import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import pdfPackage from 'pdfjs-dist/package.json'
const { version } = pdfPackage
import { PDFJS_ASSET_BASE } from './load-pdfjs'

const require = createRequire(import.meta.url)
const source = dirname(require.resolve('pdfjs-dist/package.json'))

describe('PDF.js webpack compatibility boundary', () => {
  it('uses a native browser import instead of asking Next to re-wrap PDF.js', () => {
    const loader = readFileSync(new URL('./load-pdfjs.ts', import.meta.url), 'utf8')
    const component = readFileSync(new URL('./MagazineReader.tsx', import.meta.url), 'utf8')
    expect(loader).toContain('import(/* webpackIgnore: true */ /* @vite-ignore */ moduleUrl)')
    expect(component).toContain('void loadPdfJs()')
    expect(component).not.toContain("void import('pdfjs-dist')")
    expect(component).not.toContain('new URL(')
    expect(loader).not.toContain('new Function(')
    expect(PDFJS_ASSET_BASE).toBe(`/pdfjs-assets/${version}`)
  })
  it('prepares byte-identical, version-matched renderer and worker modules', () => {
    execFileSync(process.execPath, ['scripts/prepare-reader.mjs'], { cwd: process.cwd() })
    for (const file of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
      const original = readFileSync(resolve(source, 'build', file))
      const copied = readFileSync(resolve('public', 'pdfjs-assets', version, file))
      expect(copied.equals(original)).toBe(true)
    }
    expect(
      readFileSync(
        resolve('public', 'pdfjs-assets', version, 'standard_fonts', 'LiberationSans-Regular.ttf'),
      ).length,
    ).toBeGreaterThan(0)
  })
})
