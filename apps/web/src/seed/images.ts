import sharp from 'sharp'

/**
 * Placeholder photography, generated rather than downloaded.
 *
 * Uploads are required fields on businesses, articles and issues, so a seed
 * without images cannot create any of them. Fetching real photographs would
 * make the seed depend on a network and on somebody else's licensing, and
 * committing a folder of stock JPEGs would put megabytes into the repository
 * for the sake of test data.
 *
 * These are gradients with the subject written across them. Ugly on purpose:
 * nobody should ever mistake one for real photography or be tempted to ship it.
 *
 * Emitted as JPEG rather than WebP so the seed exercises the real conversion
 * path - Media converts originals to WebP and builds five derived sizes, which
 * is worth running for the same reason the rest of this exists.
 */

/** Distinct hues so listings are told apart at a glance in the admin grid. */
const HUES = [200, 340, 25, 150, 275, 95, 310, 55] as const

export interface PlaceholderOptions {
  label: string
  width?: number
  height?: number
  /** Index into the hue list. Same index always gives the same colour. */
  seed?: number
}

function gradientSvg(label: string, width: number, height: number, hue: number): string {
  const dark = `hsl(${hue}, 45%, 22%)`
  const light = `hsl(${(hue + 40) % 360}, 55%, 48%)`

  // Wrap on spaces so a long business name does not run off the canvas.
  const words = label.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if ((current + ' ' + word).trim().length > 18) {
      if (current) lines.push(current.trim())
      current = word
    } else {
      current = `${current} ${word}`
    }
  }
  if (current.trim()) lines.push(current.trim())

  const fontSize = Math.round(width / 16)
  const lineHeight = Math.round(fontSize * 1.25)
  const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2 + fontSize / 3

  const text = lines
    .map(
      (line, i) =>
        `<text x="${width / 2}" y="${startY + i * lineHeight}" font-family="Helvetica, Arial, sans-serif" ` +
        `font-size="${fontSize}" fill="#ffffff" fill-opacity="0.92" text-anchor="middle">${escapeXml(line)}</text>`,
    )
    .join('')

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${dark}"/>
      <stop offset="100%" stop-color="${light}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <rect width="${width}" height="${height}" fill="#000000" fill-opacity="0.12"/>
  ${text}
  <text x="${width / 2}" y="${height - fontSize / 2}" font-family="Helvetica, Arial, sans-serif"
    font-size="${Math.round(fontSize / 2.4)}" fill="#ffffff" fill-opacity="0.55"
    text-anchor="middle" letter-spacing="3">SEED PLACEHOLDER</text>
</svg>`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Build one placeholder as a JPEG buffer.
 *
 * If the host has no usable fonts the text silently does not render and the
 * gradient comes through on its own, which is degraded but perfectly usable.
 * Not worth failing a seed over.
 */
export async function placeholderImage({
  label,
  width = 1600,
  height = 1067,
  seed = 0,
}: PlaceholderOptions): Promise<Buffer> {
  const hue = HUES[Math.abs(seed) % HUES.length] ?? HUES[0]
  const svg = gradientSvg(label, width, height, hue)

  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer()
}

/** Portrait, for magazine covers. */
export async function placeholderCover(label: string, seed = 0): Promise<Buffer> {
  return placeholderImage({ label, width: 1200, height: 1600, seed })
}
