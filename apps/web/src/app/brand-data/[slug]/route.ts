import { getPayload } from 'payload'
import { LOCALES, type Locale } from '@vardenia/i18n'
import config from '../../../payload.config'
import { publicBrand } from '../../../lib/brands'
import { withRateLimit } from '../../../lib/rate-limit'

/**
 * A restaurant brand and its published branches, for the public brand page
 * (Task 9). `GET /brand-data/cafe-nour?locale=ar`. The public page /brands/<slug>
 * (a later task) reads this; the data endpoint keeps its own prefix so it
 * never shares a page URL.
 *
 * Everything the answer holds is public and built field by field in
 * lib/brands (publicBrand), from public reads only. 404 for an unknown brand
 * and for one with no published branch, the same answer, so a draft brand's
 * existence is not told.
 *
 * Not under /api, which Payload owns, and excluded from locale routing in
 * proxy.ts like /place-submissions (lib/known-paths).
 *
 * `no-store`, like the other public JSON routes: a branch that is unpublished
 * or trashed must disappear at once, and the answer depends on the `locale`
 * query, which a shared cache would have to be told to vary on. It costs two
 * or three indexed reads, and the per-address rate limit bounds a burst.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export const GET = withRateLimit(
  async (request: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params
    const lang = new URL(request.url).searchParams.get('locale') ?? 'en'
    const locale: Locale = (LOCALES as readonly string[]).includes(lang) ? (lang as Locale) : 'en'

    const payload = await getPayload({ config })
    const brand = await publicBrand(payload, String(slug ?? ''), locale)
    if (!brand) return json({ ok: false, message: 'That brand is not available.' }, 404)
    return json({ ok: true, brand })
  },
)
