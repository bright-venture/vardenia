/**
 * TEMPORARY (10 Nov 2026). Applies the All Lebanon listings workbook to
 * production, by QR code: name (en + ar), slug from the name, description
 * (en + ar), the workbook photo as the cover, and the listing's QR code tied to
 * the All Lebanon issue.
 *
 *   tsx tmp-al-apply.mts <scratch> --dry-run
 *   tsx tmp-al-apply.mts <scratch> --only <QRCODE>
 *   tsx tmp-al-apply.mts <scratch> --all
 *
 * Reads <scratch>/listings/plan.json (from the read-only plan) and the workbook
 * rows. Writes a backup of every touched value before the first change, and a
 * progress file so a stopped run resumes where it left off. A listing whose
 * name or slug changed since the plan is skipped, not overwritten.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const ROOT = 'C:/Users/user/Desktop/Vardenia/vardenia'
const [S, mode, onlyCode] = process.argv.slice(2)
if (!S || !['--dry-run', '--only', '--all'].includes(mode ?? '')) {
  throw new Error('usage: tmp-al-apply.mts <scratch> --dry-run | --only <QRCODE> | --all')
}
const dryRun = mode === '--dry-run'
const dotenv = createRequire(`${ROOT}/apps/web/package.json`)('dotenv')
Object.assign(process.env, dotenv.parse(readFileSync(`${ROOT}/.env.prod`)))
process.env.NODE_ENV = 'production' // push off: never touch the schema
const { getPayload } = await import('payload')
const config = (await import('../payload.config')).default
const { slugify } = await import('../fields/slug')
const payload = await getPayload({ config })

const norm = (t: unknown) => String(t ?? '').replace(/\s+/g, ' ').trim()
const lexical = (text: string) => ({
  root: {
    type: 'root', format: '', indent: 0, version: 1, direction: 'ltr',
    children: text.split(/\n+/).map((t) => t.trim()).filter(Boolean).map((t) => ({
      type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr', textFormat: 0, textStyle: '',
      children: [{ type: 'text', mode: 'normal', text: t, format: 0, style: '', detail: 0, version: 1 }],
    })),
  },
})

const plan = JSON.parse(readFileSync(`${S}/listings/plan.json`, 'utf8')) as any[]
const sheet = JSON.parse(readFileSync(`${S}/listings/xlsx1.json`, 'utf8')).Listings as string[][]
const header = sheet[0]!
const descByCode = new Map<string, string>()
for (const r of sheet.slice(1)) {
  const code = String(r[header.indexOf('QR Slug')] ?? '').trim().toUpperCase()
  if (code) descByCode.set(code, String(r[header.indexOf('Description')] ?? '').trim())
}

const issue = (
  await payload.find({ collection: 'issues', where: { slug: { equals: 'all-lebanon' } }, limit: 1, depth: 0, overrideAccess: true })
).docs[0]
if (!issue) throw new Error('All Lebanon issue not found')

// Final slugs: the name's slug, unless another listing keeps it, then -2, -3...
const ownerOf = new Map<string, number>()
let page = 1
for (;;) {
  const batch = await payload.find({ collection: 'businesses', limit: 500, page, depth: 0, draft: true, overrideAccess: true, select: { slug: true } })
  for (const b of batch.docs as any[]) ownerOf.set(b.slug, b.id)
  if (!batch.hasNextPage) break
  page += 1
}
const inBatch = new Set(plan.map((e) => e.id))
const kept = new Map<string, number>() // slugs that stay with listings outside the batch
for (const [slug, id] of ownerOf) if (!inBatch.has(id)) kept.set(slug, id)
const taken = new Set(kept.keys())
const finalSlug = new Map<number, string>()
for (const e of plan) {
  const base = slugify(e.title)
  let slug = base
  for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`
  taken.add(slug)
  finalSlug.set(e.id, slug)
}

const todo = plan.filter((e) => mode !== '--only' || e.code === String(onlyCode).toUpperCase())
const progressFile = `${S}/listings/apply-progress.json`
const progress: Record<string, string> = existsSync(progressFile) ? JSON.parse(readFileSync(progressFile, 'utf8')) : {}

// Order: a listing whose target slug is still held by another batch listing
// waits until that one has moved.
// holder: slug -> the batch listing currently holding it.
const holder = new Map<string, number>(plan.map((e) => [e.slug, e.id]))
const order: any[] = []
const pending = todo.filter((e) => progress[e.code] !== 'done')
for (let guard = 0; pending.length && guard < 10000; guard += 1) {
  const index = pending.findIndex((e) => {
    const held = holder.get(finalSlug.get(e.id)!)
    return held === undefined || held === e.id
  })
  if (index < 0) throw new Error('slug cycle: ' + pending.map((e) => e.code).join(','))
  const [next] = pending.splice(index, 1)
  order.push(next)
  if (holder.get(next.slug) === next.id) holder.delete(next.slug)
  holder.set(finalSlug.get(next.id)!, next.id)
}

console.log(`issue: #${issue.issueNumber} ${issue.slug} (id ${issue.id})`)
console.log(`to do: ${order.length} (already done: ${todo.length - order.length - pending.length})`)
const suffixed = plan.filter((e) => finalSlug.get(e.id) !== slugify(e.title))
console.log('slugs given a suffix:', suffixed.map((e) => `${e.title} -> ${finalSlug.get(e.id)}`))
console.log('slug changes:', plan.filter((e) => finalSlug.get(e.id) !== e.slug).length)

if (dryRun) {
  for (const e of order.slice(0, 5)) {
    console.log(`  ${e.code}: "${e.nameEn}" -> "${e.title}", ${e.slug} -> ${finalSlug.get(e.id)}, photo ${e.photo.split(/[\\/]/).pop()}`)
  }
  console.log('Dry run: nothing written.')
  process.exit(0)
}

// Backup of everything about to change, before the first write.
const backup: any[] = []
for (const e of order) {
  const en: any = await payload.findByID({ collection: 'businesses', id: e.id, locale: 'en', depth: 0, draft: true, overrideAccess: true })
  const ar: any = await payload.findByID({ collection: 'businesses', id: e.id, locale: 'ar', depth: 0, draft: true, overrideAccess: true })
  const qr: any = await payload.findByID({ collection: 'qr-codes', id: e.qr.id, depth: 0, overrideAccess: true })
  backup.push({
    code: e.code, id: e.id, slug: en.slug, heroImage: en.heroImage ?? null,
    en: { name: en.name, description: en.description }, ar: { name: ar.name, description: ar.description },
    qr: { id: qr.id, issue: qr.issue ?? null },
  })
}
mkdirSync(`${ROOT}/../backups/all-lebanon-2026`, { recursive: true })
const backupFile = `${ROOT}/../backups/all-lebanon-2026/before-${mode === '--only' ? onlyCode : 'all'}-${Date.now()}.json`
writeFileSync(backupFile, JSON.stringify(backup, null, 1))
console.log('backup', backup.length, 'listings ->', backupFile)

const retry = async <T,>(what: string, fn: () => Promise<T>): Promise<T> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= 4) throw error
      console.log(`  retry ${attempt} (${what}): ${String((error as Error).message).slice(0, 100)}`)
      await new Promise((r) => setTimeout(r, 3000 * attempt))
    }
  }
}

let done = 0
const skipped: string[] = []
for (const e of order) {
  const before = backup.find((b) => b.id === e.id)!
  if (norm(before.en.name) !== norm(e.nameEn) || before.slug !== e.slug) {
    skipped.push(`${e.code} ${e.title}: changed since the plan`)
    progress[e.code] = 'skipped: changed'
    writeFileSync(progressFile, JSON.stringify(progress, null, 1))
    continue
  }
  try {
    const name = String(e.title).trim()
    const text = descByCode.get(e.code) ?? ''
    const hero = e.hero ?? {}
    const media: any = await retry('photo upload', () =>
      payload.create({
        collection: 'media',
        locale: 'en',
        data: {
          alt: name,
          usageRights: hero.rights === 'licensed' || hero.rights === 'supplied' ? hero.rights : 'owned',
          ...(hero.credit ? { credit: hero.credit } : {}),
        } as never,
        filePath: e.photo,
        overrideAccess: true,
      }),
    )
    await retry('listing en', () =>
      payload.update({
        collection: 'businesses', id: e.id, locale: 'en', overrideAccess: true, context: { allLebanonIssue: true },
        data: { name, slug: finalSlug.get(e.id), description: lexical(text), heroImage: media.id } as never,
      }),
    )
    await retry('listing ar', () =>
      payload.update({
        collection: 'businesses', id: e.id, locale: 'ar', overrideAccess: true, context: { allLebanonIssue: true },
        data: { name, description: lexical(text) } as never,
      }),
    )
    await retry('qr issue', () =>
      payload.update({ collection: 'qr-codes', id: e.qr.id, overrideAccess: true, data: { issue: issue.id } as never }),
    )
    progress[e.code] = 'done'
    done += 1
    if (done % 20 === 0) console.log(`  ${done} done`)
  } catch (error) {
    progress[e.code] = `failed: ${String((error as Error).message).slice(0, 160)}`
    skipped.push(`${e.code} ${e.title}: failed (${String((error as Error).message).slice(0, 100)})`)
  }
  writeFileSync(progressFile, JSON.stringify(progress, null, 1))
}
console.log('updated', done, '| skipped or failed', skipped.length)
skipped.forEach((s) => console.log('  ', s))
process.exit(0)
