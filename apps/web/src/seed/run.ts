import type { Payload } from 'payload'
import {
  ARTICLES,
  BUSINESSES,
  ISSUES,
  MEDIA_PREFIX,
  SCAN_CITIES,
  type BusinessFixture,
} from './fixtures'
import { placeholderCover, placeholderImage } from './images'
import { richText } from './rich-text'
import { idsFor, record, type Manifest, type ManifestCollection } from './manifest'

/**
 * The seed and its undo, as functions rather than as scripts.
 *
 * Split out of index.ts so the integration tests can build a populated database
 * and tear it down again without shelling out to a command. index.ts and
 * reset.ts are now thin command line wrappers around these two.
 */

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@vardenia.local'
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!'
const STAFF_EMAIL = process.env.SEED_STAFF_EMAIL ?? 'staff@vardenia.local'

/** Scans to generate across all codes. Enough for the report to have shape. */
const SCAN_COUNT = 220

/** Collections this script writes to. */
type SeedCollection = 'businesses' | 'articles' | 'issues'

/**
 * The single place fixture data crosses into Payload's generated types.
 *
 * Payload narrows fields like `category` and `governorate` to literal unions
 * built from the taxonomy. The fixtures hold plain strings deliberately, so that
 * fixtures.ts does not depend on payload-types.ts - a generated, gitignored file
 * (the same call as in lib/qr-doc.ts).
 *
 * The cast is not a shrug. fixtures.test.ts checks every one of those strings
 * against the real TAXONOMY and GOVERNORATES and fails by name if one is wrong,
 * which catches more than the compiler would here: it also rejects a
 * subcategory that is real but filed under the wrong parent.
 */
const asData = <T>(data: Record<string, unknown>): T => data as T

/**
 * Deterministic pseudo-random, so re-seeding a reset database reproduces the
 * same numbers. A report that changes every run is one nobody can sanity-check.
 */
function makeRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

interface Existing {
  id: number | string
}

async function findBySlug(
  payload: Payload,
  collection: SeedCollection,
  slug: string,
): Promise<Existing | null> {
  const found = await payload.find({
    collection,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    // Drafts too, or the draft fixture is recreated on every run.
    draft: true,
  })

  return (found.docs[0] as Existing | undefined) ?? null
}

interface UploadArgs {
  /** Becomes the filename, prefixed so reset can find it again. */
  name: string
  /** Drawn across the placeholder. */
  label: string
  alt: string
  cover?: boolean
  seed?: number
}

async function uploadImage(
  payload: Payload,
  manifest: Manifest,
  { name, label, alt, cover, seed = 0 }: UploadArgs,
) {
  const filename = `${MEDIA_PREFIX}${name}.jpg`

  const existing = await payload.find({
    collection: 'media',
    where: { filename: { equals: filename } },
    limit: 1,
    depth: 0,
  })

  const found = existing.docs[0]
  if (found) return found.id

  const data = cover ? await placeholderCover(label, seed) : await placeholderImage({ label, seed })

  const created = await payload.create({
    collection: 'media',
    data: { alt, credit: 'Vardenia seed data', usageRights: 'owned' },
    file: { data, mimetype: 'image/jpeg', name: filename, size: data.length },
  })

  record(manifest, 'media', created.id)
  return created.id
}

async function seedUsers(payload: Payload, manifest: Manifest) {
  const existing = await payload.find({ collection: 'users', limit: 1, depth: 0 })

  if (existing.totalDocs === 0) {
    await payload.create({
      collection: 'users',
      data: { name: 'Vardenia Admin', email: EMAIL, password: PASSWORD, roles: ['admin'] },
    })
    payload.logger.info(`Created admin ${EMAIL}`)
  }

  const staff = await payload.find({
    collection: 'users',
    where: { email: { equals: STAFF_EMAIL } },
    limit: 1,
    depth: 0,
  })

  if (staff.totalDocs === 0) {
    // A second account matters: it is the only way to check by hand that a staff
    // user cannot edit tier or grant themselves a role.
    //
    // Recorded, unlike the admin above. The admin is a bootstrap account - if the
    // seed created it, it is the only way in, and a cleanup script that locks you
    // out of your own admin panel is not a cleanup script. This one is fixture
    // data with a default password and should not outlive the fixtures.
    const created = await payload.create({
      collection: 'users',
      data: { name: 'Vardenia Staff', email: STAFF_EMAIL, password: PASSWORD, roles: ['staff'] },
    })
    record(manifest, 'users', created.id)
    payload.logger.info(`Created staff ${STAFF_EMAIL}`)
  }
}

async function seedIssues(payload: Payload, manifest: Manifest) {
  for (const fixture of ISSUES) {
    if (await findBySlug(payload, 'issues', fixture.slug)) continue

    const cover = await uploadImage(payload, manifest, {
      name: `issue-${fixture.slug}`,
      label: fixture.title.en,
      alt: `Cover of ${fixture.title.en}`,
      cover: true,
      seed: fixture.issueNumber,
    })

    const created = await payload.create({
      collection: 'issues',
      locale: 'en',
      data: asData({
        title: fixture.title.en,
        slug: fixture.slug,
        season: fixture.season.en,
        issueNumber: fixture.issueNumber,
        cover,
        publishedAt: fixture.publishedAt,
        pageCount: fixture.pageCount,
        printRun: fixture.printRun,
      }),
    })

    await payload.update({
      collection: 'issues',
      id: created.id,
      locale: 'ar',
      data: asData({ title: fixture.title.ar, season: fixture.season.ar }),
    })

    record(manifest, 'issues', created.id)
    payload.logger.info(`Issue: ${fixture.title.en}`)
  }
}

function buildBusiness(fixture: BusinessFixture, heroImage: number | string) {
  return {
    name: fixture.name.en,
    slug: fixture.slug,
    tagline: fixture.tagline.en,
    description: richText([fixture.description.en]),
    heroImage,
    category: fixture.category,
    subcategories: fixture.subcategories,
    governorate: fixture.governorate,
    district: fixture.district,
    address: fixture.address.en,
    location: fixture.location,
    openingHours: fixture.openingHours,
    amenities: fixture.amenities,
    priceRange: fixture.priceRange,
    phone: fixture.phone,
    website: fixture.website,
    tier: fixture.tier,
    verified: fixture.verified,
    contractStartsAt: fixture.contractStartsAt,
    contractEndsAt: fixture.contractEndsAt,
    internalNotes: fixture.internalNotes,
    _status: fixture.status,
  }
}

async function seedBusinesses(payload: Payload, manifest: Manifest) {
  for (const [index, fixture] of BUSINESSES.entries()) {
    if (await findBySlug(payload, 'businesses', fixture.slug)) continue

    const heroImage = await uploadImage(payload, manifest, {
      name: `business-${fixture.slug}`,
      label: fixture.name.en,
      alt: fixture.name.en,
      seed: index,
    })

    // Draft state comes from `_status` in the data rather than the `draft`
    // option. Both work, but `draft` is typed as a conditional on a literal
    // boolean, so passing a computed one collapses the data type to never.
    const created = await payload.create({
      collection: 'businesses',
      locale: 'en',
      data: asData(buildBusiness(fixture, heroImage)),
    })

    await payload.update({
      collection: 'businesses',
      id: created.id,
      locale: 'ar',
      data: asData({
        name: fixture.name.ar,
        tagline: fixture.tagline.ar,
        address: fixture.address.ar,
        description: richText([fixture.description.ar]),
        // Carried through, or the Arabic pass would publish the draft fixture.
        _status: fixture.status,
      }),
    })

    record(manifest, 'businesses', created.id)

    // The afterChange hook mints a code as soon as the listing exists. Record it
    // now so reset can remove it even if the run dies before the scan step.
    const minted = await payload.find({
      collection: 'qr-codes',
      where: { business: { equals: created.id } },
      limit: 10,
      depth: 0,
    })
    for (const code of minted.docs) record(manifest, 'qr-codes', code.id)

    payload.logger.info(`Business: ${fixture.name.en} (${fixture.tier})`)
  }
}

async function resolveBusinessIds(payload: Payload, slugs: string[]) {
  const ids: (number | string)[] = []
  for (const slug of slugs) {
    const found = await findBySlug(payload, 'businesses', slug)
    if (found) ids.push(found.id)
  }
  return ids
}

async function seedArticles(payload: Payload, manifest: Manifest) {
  const firstIssue = ISSUES[0]
  const issue = firstIssue ? await findBySlug(payload, 'issues', firstIssue.slug) : null

  for (const [index, fixture] of ARTICLES.entries()) {
    if (await findBySlug(payload, 'articles', fixture.slug)) continue

    const heroImage = await uploadImage(payload, manifest, {
      name: `article-${fixture.slug}`,
      label: fixture.title.en,
      alt: fixture.title.en,
      seed: index + BUSINESSES.length,
    })

    const featured = await resolveBusinessIds(payload, fixture.featured)
    const sponsor = fixture.sponsoredBy
      ? await findBySlug(payload, 'businesses', fixture.sponsoredBy)
      : null

    const created = await payload.create({
      collection: 'articles',
      locale: 'en',
      data: asData({
        title: fixture.title.en,
        slug: fixture.slug,
        excerpt: fixture.excerpt.en,
        body: richText(fixture.body.en),
        kind: fixture.kind,
        heroImage,
        featuredBusinesses: featured,
        sponsoredBy: sponsor?.id,
        category: fixture.category,
        governorate: fixture.governorate,
        publishedAt: fixture.publishedAt,
        print: issue
          ? { issue: issue.id, pageFrom: fixture.pageFrom, pageTo: fixture.pageTo }
          : undefined,
        _status: fixture.status,
      }),
    })

    await payload.update({
      collection: 'articles',
      id: created.id,
      locale: 'ar',
      data: asData({
        title: fixture.title.ar,
        excerpt: fixture.excerpt.ar,
        body: richText(fixture.body.ar),
      }),
    })

    record(manifest, 'articles', created.id)
    payload.logger.info(`Article: ${fixture.title.en}`)
  }
}

/**
 * Attach every code to the issue and generate a scan history.
 *
 * Codes themselves are not created here - the afterChange hook on Businesses
 * mints one the moment a listing exists, which is the behaviour the seed should
 * be exercising rather than working around.
 *
 * The distribution is deliberately uneven. A report where every listing scores
 * the same tells you nothing about whether the sorting, the top-city column or
 * the direct/shared split actually work.
 */
async function seedScans(payload: Payload, manifest: Manifest) {
  /**
   * Scoped to the listings this seed created, and nothing else.
   *
   * The first version queried every QR code in the database. Run against a
   * database that already had real work in it, it attached a real listing's code
   * to the fixture issue and gave it a fabricated scan history - inventing
   * evidence on exactly the record this whole system exists to keep honest.
   *
   * Anything the seed writes to, the seed must have created.
   */
  const businessIds = await resolveBusinessIds(
    payload,
    BUSINESSES.map((b) => b.slug),
  )

  if (businessIds.length === 0) {
    payload.logger.warn('No seeded listings found - skipping scan events.')
    return
  }

  const codes = await payload.find({
    collection: 'qr-codes',
    where: { business: { in: businessIds } },
    limit: 100,
    depth: 0,
  })

  if (codes.docs.length === 0) {
    payload.logger.warn('Seeded listings have no QR codes - skipping scan events.')
    return
  }

  const existing = await payload.find({
    collection: 'scan-events',
    where: { qrCode: { in: codes.docs.map((c) => c.id) } },
    limit: 1,
    depth: 0,
  })

  if (existing.totalDocs > 0) {
    payload.logger.info('Scan events already present for seeded codes - skipping.')
    return
  }

  const firstIssue = ISSUES[0]
  const issue = firstIssue ? await findBySlug(payload, 'issues', firstIssue.slug) : null

  // Weight the codes so the report has a clear leader and a clear tail.
  const weights = codes.docs.map((_, i) => 1 / (i + 1))
  const total = weights.reduce((a, b) => a + b, 0)
  const cityTotal = SCAN_CITIES.reduce((sum, c) => sum + c.weight, 0)

  const random = makeRandom(20260815)
  const now = Date.now()
  const counts = new Map<number | string, number>()

  for (let i = 0; i < SCAN_COUNT; i++) {
    const code = pick(codes.docs, weights, total, random())
    const city = pickCity(random() * cityTotal)
    if (!code || !city) continue

    // Skewed towards recent, so a 90-day report and a 30-day one differ.
    const daysAgo = Math.floor(Math.pow(random(), 1.8) * 85)
    const scannedAt = new Date(now - daysAgo * 86_400_000 - Math.floor(random() * 86_400_000))

    const roll = random()
    const platform = roll < 0.55 ? 'ios' : roll < 0.92 ? 'android' : 'web'

    const event = await payload.create({
      collection: 'scan-events',
      data: asData({
        code: code.code,
        qrCode: code.id,
        business: code.business ?? undefined,
        scannedAt: scannedAt.toISOString(),
        placement: code.placement,
        city: city.city,
        country: city.country,
        platform,
        // Roughly one in six is a forwarded link rather than a camera scan.
        isDirectScan: random() > 0.17,
      }),
    })

    record(manifest, 'scan-events', event.id)
    counts.set(code.id, (counts.get(code.id) ?? 0) + 1)
  }

  // Counter and issue assignment, matching what the redirect route would leave
  // behind. Assigning the issue also makes protectPrintedCodes meaningful.
  for (const code of codes.docs) {
    await payload.update({
      collection: 'qr-codes',
      id: code.id,
      data: asData({
        scanCount: counts.get(code.id) ?? 0,
        ...(issue ? { issue: issue.id } : {}),
      }),
    })
  }

  payload.logger.info(`Scan events: ${SCAN_COUNT} across ${codes.docs.length} codes`)
}

function pick<T>(items: T[], weights: number[], total: number, roll: number): T | undefined {
  let threshold = roll * total
  for (let i = 0; i < items.length; i++) {
    threshold -= weights[i] ?? 0
    if (threshold <= 0) return items[i]
  }
  return items[items.length - 1]
}

function pickCity(roll: number) {
  let threshold = roll
  for (const city of SCAN_CITIES) {
    threshold -= city.weight
    if (threshold <= 0) return city
  }
  return SCAN_CITIES[0]
}

/** Insert the whole fixture set. Idempotent: existing documents are skipped. */
export async function runSeed(payload: Payload, manifest: Manifest): Promise<Manifest> {
  await seedUsers(payload, manifest)
  await seedIssues(payload, manifest)
  await seedBusinesses(payload, manifest)
  await seedArticles(payload, manifest)
  await seedScans(payload, manifest)
  return manifest
}

/**
 * Remove everything the manifest records, in an order the delete guards allow.
 *
 * protectPrintedCodes refuses a code that has been scanned or assigned to an
 * issue, and protectBusinessWithPrintedCode refuses a listing that owns one.
 * Neither is bypassed; the scan history and the issue assignment come off first,
 * which is what a person would have to do through the admin.
 */
export async function resetSeed(payload: Payload, manifest: Manifest): Promise<void> {
  await deleteAll(payload, 'scan-events', idsFor(manifest, 'scan-events'))

  const codeIds = idsFor(manifest, 'qr-codes')
  for (const id of codeIds) {
    try {
      await payload.update({
        collection: 'qr-codes',
        id,
        data: asData({ scanCount: 0, issue: null }),
      })
    } catch {
      // Gone already, or never created. deleteAll reports anything real.
    }
  }
  await deleteAll(payload, 'qr-codes', codeIds)

  await deleteAll(payload, 'articles', idsFor(manifest, 'articles'))
  await deleteAll(payload, 'businesses', idsFor(manifest, 'businesses'))
  await deleteAll(payload, 'issues', idsFor(manifest, 'issues'))

  // Media last: blockMediaInUse refuses anything still referenced, so a warning
  // here means something above did not get removed.
  await deleteAll(payload, 'media', idsFor(manifest, 'media'))

  // Only users the seed recorded, which is the staff fixture and never the
  // bootstrap admin - locking someone out of their own admin panel is not
  // cleanup.
  await deleteAll(payload, 'users', idsFor(manifest, 'users'))
}

async function deleteAll(
  payload: Payload,
  collection: ManifestCollection,
  ids: (number | string)[],
) {
  let removed = 0

  for (const id of ids) {
    try {
      await payload.delete({ collection, id })
      removed++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/not found/i.test(message)) {
        payload.logger.warn(`Could not delete ${collection} ${id}: ${message}`)
      }
    }
  }

  if (removed > 0) payload.logger.info(`Removed ${removed} from ${collection}`)
  return removed
}
