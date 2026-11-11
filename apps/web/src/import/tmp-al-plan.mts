/**
 * READ-ONLY. Plans the All Lebanon listing changes (10 Nov 2026): for each
 * workbook row, find the listing through its QR code and compare name, slug,
 * description and photo with what is live. Writes plan.json and prints a
 * summary. Nothing is written to the database.
 *
 * Usage: plan.mts <scratch> <rows.json> <photos dir>
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const ROOT = 'C:/Users/user/Desktop/Vardenia/vardenia'
const [S, rowsFile, photosDir] = process.argv.slice(2)
const dotenv = createRequire(`${ROOT}/apps/web/package.json`)('dotenv')
Object.assign(process.env, dotenv.parse(readFileSync(`${ROOT}/.env.prod`)))
process.env.NODE_ENV = 'production' // push off: never touch the schema
const { getPayload } = await import('payload')
const config = (await import(`file:///${ROOT}/apps/web/src/payload.config.ts`)).default
const { slugify } = await import(`file:///${ROOT}/apps/web/src/fields/slug.ts`)
const payload = await getPayload({ config })

const norm = (t: unknown) => String(t ?? '').replace(/\s+/g, ' ').trim()
const plain = (doc: any) =>
  (doc?.root?.children ?? [])
    .map((p: any) => (p.children ?? []).map((n: any) => n.text ?? '').join(''))
    .join('\n')

const sheet = JSON.parse(readFileSync(rowsFile, 'utf8')).Listings as string[][]
const header = sheet[0]!
const rows = sheet.slice(1).filter((r) => r.some((v) => String(v).trim()))
const col = (r: string[], name: string) => String(r[header.indexOf(name)] ?? '').trim()

// Every QR code in the workbook, with its listing.
const codes = rows.map((r) => col(r, 'QR Slug').toUpperCase())
const qrDocs: any[] = []
for (let i = 0; i < codes.length; i += 100) {
  const found = await payload.find({
    collection: 'qr-codes',
    where: { code: { in: codes.slice(i, i + 100) } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  qrDocs.push(...found.docs)
}
const qrByCode = new Map(qrDocs.map((q) => [String(q.code).toUpperCase(), q]))

// Every listing's slug, to find clashes with the proposed ones.
const allSlugs = new Map<string, number>()
let page = 1
for (;;) {
  const batch = await payload.find({
    collection: 'businesses',
    limit: 500,
    page,
    depth: 0,
    draft: true,
    overrideAccess: true,
    select: { slug: true },
  })
  for (const b of batch.docs as any[]) allSlugs.set(b.slug, b.id)
  if (!batch.hasNextPage) break
  page += 1
}

const plan: any[] = []
for (const r of rows) {
  const code = col(r, 'QR Slug').toUpperCase()
  const title = col(r, 'Title')
  const desc = String(r[header.indexOf('Description')] ?? '').trim()
  const photoRel = col(r, 'Photo file')
  const photo = photoRel ? path.join(photosDir, photoRel.replace(/^Photos[\\/]/, '')) : ''
  const entry: any = {
    row: col(r, '#'),
    code,
    title,
    region: col(r, 'Region'),
    category: col(r, 'Category'),
    page: col(r, 'Magazine page'),
    notes: col(r, 'Notes / flags'),
    photo,
    photoExists: photo ? existsSync(photo) : false,
    photoKB: photo && existsSync(photo) ? Math.round(statSync(photo).size / 1024) : 0,
  }
  const qr = qrByCode.get(code)
  if (!qr) {
    entry.problem = 'QR code not found'
    plan.push(entry)
    continue
  }
  entry.qr = { id: qr.id, targetType: qr.targetType, active: qr.active, issue: qr.issue ?? null, placement: qr.placement }
  if (qr.targetType !== 'business' || !qr.business) {
    entry.problem = `QR code points at ${qr.targetType}, not a listing`
    plan.push(entry)
    continue
  }
  const id = typeof qr.business === 'object' ? qr.business.id : qr.business
  const en: any = await payload.findByID({ collection: 'businesses', id, locale: 'en', depth: 1, draft: true, overrideAccess: true })
  const ar: any = await payload.findByID({ collection: 'businesses', id, locale: 'ar', depth: 0, draft: true, overrideAccess: true })
  const newSlug = slugify(title)
  const clashId = allSlugs.get(newSlug)
  Object.assign(entry, {
    id,
    status: en._status,
    governorate: en.governorate,
    liveCategory: en.category,
    nameEn: en.name,
    nameAr: ar.name,
    nameChange: norm(en.name) !== norm(title) || norm(ar.name) !== norm(title),
    slug: en.slug,
    newSlug,
    slugChange: en.slug !== newSlug,
    slugClash: clashId !== undefined && clashId !== id ? clashId : null,
    descChange: norm(plain(en.description)) !== norm(desc) || norm(plain(ar.description)) !== norm(desc),
    descEmpty: !norm(desc),
    hero: en.heroImage
      ? {
          id: en.heroImage.id,
          filename: en.heroImage.filename,
          preview: en.heroImage.sizes?.card?.url ?? en.heroImage.sizes?.thumbnail?.url ?? en.heroImage.url ?? null,
          credit: en.heroImage.credit ?? null,
          rights: en.heroImage.usageRights ?? null,
        }
      : null,
    galleryCount: Array.isArray(en.gallery) ? en.gallery.length : 0,
  })
  plan.push(entry)
}

// Two rows asking for the same new slug.
const wanted = new Map<string, string[]>()
for (const e of plan) if (e.newSlug) wanted.set(e.newSlug, [...(wanted.get(e.newSlug) ?? []), e.code])
for (const e of plan) if (e.newSlug && wanted.get(e.newSlug)!.length > 1) e.slugDuplicateInSheet = wanted.get(e.newSlug)

writeFileSync(`${S}/listings/plan.json`, JSON.stringify(plan, null, 1))

const count = (f: (e: any) => boolean) => plan.filter(f).length
console.log('rows:', plan.length)
console.log('problems:', count((e) => e.problem), plan.filter((e) => e.problem).map((e) => `${e.code} ${e.problem}`).slice(0, 10))
console.log('found listings:', count((e) => e.id), '| distinct:', new Set(plan.filter((e) => e.id).map((e) => e.id)).size)
console.log('status:', JSON.stringify(Object.fromEntries([...new Set(plan.map((e) => e.status))].map((s) => [s, count((e) => e.status === s)]))))
console.log('name changes:', count((e) => e.nameChange), '| slug changes:', count((e) => e.slugChange), '| description changes:', count((e) => e.descChange), '| empty descriptions:', count((e) => e.descEmpty))
console.log('slug clashes with other listings:', count((e) => e.slugClash), '| duplicate new slugs in sheet:', count((e) => e.slugDuplicateInSheet))
console.log('photos present:', count((e) => e.photoExists), '/', plan.length, '| listings with a hero now:', count((e) => e.hero))
console.log('hero credits now:', JSON.stringify(Object.fromEntries([...new Set(plan.map((e) => `${e.hero?.credit}|${e.hero?.rights}`))].map((s) => [s, count((e) => `${e.hero?.credit}|${e.hero?.rights}` === s)]))))
console.log('QR issue now:', JSON.stringify(Object.fromEntries([...new Set(plan.map((e) => String(e.qr?.issue)))].map((s) => [s, count((e) => String(e.qr?.issue) === s)]))), '| placement:', JSON.stringify(Object.fromEntries([...new Set(plan.map((e) => String(e.qr?.placement)))].map((s) => [s, count((e) => String(e.qr?.placement) === s)]))))
console.log('regions:', JSON.stringify(Object.fromEntries([...new Set(plan.map((e) => e.region))].map((s) => [s, count((e) => e.region === s)]))))
console.log('rows with notes/flags:', count((e) => e.notes))
process.exit(0)
