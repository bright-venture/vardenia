/**
 * Where the public files of a storage bucket can be read, for browsers.
 *
 * A Supabase bucket is reachable at two addresses. `S3_ENDPOINT` is the
 * authenticated S3 API the upload SDK talks to; handing that path to a browser
 * returns an error. Reads need the anonymous public path, which is normally
 * `https://<ref>.supabase.co/storage/v1/object/public/<bucket>`, derived here
 * from the endpoint.
 *
 * `S3_PUBLIC_BASE_URL` overrides the derivation for the media bucket when the
 * guess is wrong (Supabase has more than one host shape in circulation). For
 * the magazine PDFs bucket, on the same project, the override's last segment
 * is swapped for that bucket, so one override serves both.
 *
 * One module for the site config, which builds the file URLs, and for the
 * magazine reader, which only serves files from these addresses: the two must
 * agree, or the reader refuses the very PDFs the admin uploaded.
 */

type Env = Record<string, string | undefined>

/** The bucket for magazine PDFs (collections/Editions). */
export function editionsBucket(env: Env = process.env): string {
  return env.S3_EDITIONS_BUCKET?.trim() || 'editions'
}

/** The anonymous public path of a bucket, derived from the S3 endpoint. */
function derived(bucket: string, env: Env): string {
  const endpoint = (env.S3_ENDPOINT ?? '').replace(/\/$/, '')
  if (!endpoint || !bucket) return ''
  const base = endpoint.endsWith('/storage/v1/s3')
    ? endpoint.replace(/\/storage\/v1\/s3$/, '/storage/v1/object/public')
    : endpoint
  return `${base}/${bucket}`
}

/** The media bucket's public base: the override as given, else derived. */
export function mediaPublicBase(env: Env = process.env): string {
  const override = (env.S3_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
  return override || derived(env.S3_BUCKET ?? '', env)
}

/** The magazine PDFs bucket's public base, beside the media bucket's. */
export function editionsPublicBase(env: Env = process.env): string {
  const bucket = editionsBucket(env)
  const override = (env.S3_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
  const media = env.S3_BUCKET ?? ''
  if (override) {
    return media && override.endsWith(`/${media}`)
      ? `${override.slice(0, -media.length)}${bucket}`
      : ''
  }
  return derived(bucket, env)
}
