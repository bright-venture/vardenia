import { cp, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Serve PDF font/CMap/image-decoder assets from this site, never from a CDN.
// Keep them version-matched to the renderer and worker installed by pnpm.
const require = createRequire(import.meta.url)
const source = dirname(require.resolve('pdfjs-dist/package.json'))
const { version } = require('pdfjs-dist/package.json')
const destination = join(dirname(fileURLToPath(import.meta.url)), '../public/pdfjs-assets', version)
await mkdir(destination, { recursive: true })
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(join(source, folder), join(destination, folder), { recursive: true })
}

// These prebuilt ES modules must stay unmodified: Next's webpack compiler must
// not wrap PDF.js's own webpack runtime a second time.
for (const file of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  await cp(join(source, 'build', file), join(destination, file))
}
