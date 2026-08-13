/**
 * Helpers for turning a Payload upload into something next/image can render.
 *
 * Media may arrive as a numeric id (when depth is too shallow) or as a full
 * document. Everything here tolerates both and returns null rather than
 * throwing, because a missing image should degrade a page, not break it.
 */

export interface MediaLike {
  url?: string | null
  alt?: string | null
  width?: number | null
  height?: number | null
  sizes?: Record<string, { url?: string | null; width?: number | null; height?: number | null }>
}

export type MediaField = number | string | MediaLike | null | undefined

export interface ResolvedImage {
  src: string
  alt: string
  width: number
  height: number
}

/** Size names, largest first, as declared in the Media collection. */
const FALLBACK_ORDER = ['hero', 'portrait', 'card', 'thumbnail'] as const

/**
 * Payload returns upload URLs absolute, prefixed with `serverURL`, e.g.
 * `http://localhost:3000/api/media/file/photo.jpg`. next/image refuses any
 * hostname not listed in `images.remotePatterns`, so those blow up.
 *
 * Whitelisting localhost would fix development and break the moment the site
 * runs on a real domain. Instead, strip the origin when the URL points at us
 * and hand next/image a path, which is host-independent and works everywhere.
 * URLs on another host (S3, R2) are left alone and matched by remotePatterns.
 */
function toRenderableSrc(url: string): string {
  if (!url.startsWith('http')) return url
  try {
    const parsed = new URL(url)

    // Payload serves local-disk uploads from this path. Always same-origin.
    if (parsed.pathname.startsWith('/api/media/')) return parsed.pathname + parsed.search

    const site = process.env.NEXT_PUBLIC_SITE_URL
    if (site && parsed.host === new URL(site).host) return parsed.pathname + parsed.search

    return url
  } catch {
    return url
  }
}

export function resolveImage(
  field: MediaField,
  preferred: (typeof FALLBACK_ORDER)[number] = 'card',
): ResolvedImage | null {
  if (!field || typeof field !== 'object') return null

  const order = [preferred, ...FALLBACK_ORDER.filter((s) => s !== preferred)]
  for (const size of order) {
    const candidate = field.sizes?.[size]
    if (candidate?.url) {
      return {
        src: toRenderableSrc(candidate.url),
        alt: field.alt ?? '',
        width: candidate.width ?? 1600,
        height: candidate.height ?? 900,
      }
    }
  }

  if (field.url) {
    return {
      src: toRenderableSrc(field.url),
      alt: field.alt ?? '',
      width: field.width ?? 1600,
      height: field.height ?? 900,
    }
  }
  return null
}

export function resolveGallery(
  fields: MediaField[] | null | undefined,
  limit?: number,
): ResolvedImage[] {
  if (!Array.isArray(fields)) return []
  const images = fields
    .map((f) => resolveImage(f, 'card'))
    .filter((img): img is ResolvedImage => img !== null)

  // Trimmed, never dropped. The Businesses collection promises editors that
  // "extra images are hidden, not deleted", so an upgrade brings them back
  // without anyone re-uploading.
  return typeof limit === 'number' ? images.slice(0, Math.max(0, limit)) : images
}
