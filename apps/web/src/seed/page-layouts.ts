/**
 * Sample page layouts for staging (26 November 2026): a template of about 100
 * pages, linked to the seed's OWN issue "Sample issue (test values)", with
 * placeholder prices and the seven governorate page blocks. TEST VALUES, not
 * the real price list.
 *
 *   pnpm seed:layouts            shows what it would do
 *   pnpm seed:layouts --apply    does it
 *
 * Why its own issue: "All Lebanon" (seed/listing-ranges.ts) already has seven
 * manual number ranges, and an issue with ranges cannot take a template, so
 * linking the sample there would do nothing. The sample issue borrows the
 * cover of the newest existing issue (as seed/listing-ranges.ts does; Payload
 * requires one) and takes issue number 9001, far above any real issue.
 *
 * Guarded like the other seeds (refuses any database but SEED_ALLOWED_DB) and
 * safe to re-run: it never overwrites (seed/page-layouts-plan sampleIssuePlan
 * decides which steps are still to do). The template is created only when none
 * has the sample name; the issue only when none has the sample title and its
 * number is free. The template is linked through the issue's own update, so
 * the hook that copies the slots and locks the template runs exactly as it
 * does in the admin; then the price table; then the page blocks (the hook
 * refuses a template change while ranges exist), from the issue's copied
 * slots. It creates no business.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { getPayload } from 'payload'
import { PAGE_LAYOUT_LABELS, buildSlots, templateTotals, type Slot } from '@vardenia/core'
import { assertSeedTarget } from './guard'
import {
  PLACEHOLDER_PRICES,
  SAMPLE_ISSUE_NUMBER,
  SAMPLE_ISSUE_TITLE,
  SAMPLE_PAGES,
  TEMPLATE_NAME,
  describeTemplate,
  planBlocks,
  sampleIssuePlan,
  type SampleIssueState,
} from './page-layouts-plan'

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') })

const { default: config } = await import('../payload.config')

const asData = <T>(data: Record<string, unknown>): T => data as T

async function main() {
  const apply = process.argv.includes('--apply')
  const target = assertSeedTarget()
  console.log(`${apply ? 'Applying to' : 'Dry run against'} ${target}`)

  const payload = await getPayload({ config })

  // 1. The template.
  const foundTemplate = await payload.find({
    collection: 'templates',
    where: { name: { equals: TEMPLATE_NAME } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  let templateId: number | null = foundTemplate.docs[0]?.id ?? null
  if (templateId) {
    console.log(`Template "${TEMPLATE_NAME}" exists (id ${templateId}); left alone.`)
  } else {
    console.log(`Would create template "${TEMPLATE_NAME}": ${describeTemplate()}.`)
    if (apply) {
      const made = await payload.create({
        collection: 'templates',
        data: asData({ name: TEMPLATE_NAME, pages: SAMPLE_PAGES }),
        depth: 0,
        overrideAccess: true,
      })
      templateId = made.id
      console.log(`Created template ${templateId}.`)
    }
  }

  // 2. The sample issue: what it still needs.
  const byTitle = await payload.find({
    collection: 'issues',
    where: { title: { equals: SAMPLE_ISSUE_TITLE } },
    locale: 'en',
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  let issue = byTitle.docs[0] ?? null
  let state: SampleIssueState | null = null
  if (issue) {
    const linkedTo = typeof issue.template === 'object' ? issue.template?.id : issue.template
    state = {
      template: !linkedTo ? 'none' : linkedTo === templateId ? 'sample' : 'other',
      hasPrices: Array.isArray(issue.layouts) && issue.layouts.length > 0,
      rangeCount: (
        await payload.count({
          collection: 'listing-ranges',
          where: { issue: { equals: issue.id } },
          overrideAccess: true,
        })
      ).totalDocs,
      heldCount: (
        await payload.count({
          collection: 'businesses',
          where: { and: [{ issue: { equals: issue.id } }, { listingNumber: { exists: true } }] },
          overrideAccess: true,
        })
      ).totalDocs,
    }
  }
  const byNumber = issue
    ? null
    : (
        await payload.find({
          collection: 'issues',
          where: { issueNumber: { equals: SAMPLE_ISSUE_NUMBER } },
          locale: 'en',
          depth: 0,
          limit: 1,
          overrideAccess: true,
        })
      ).docs[0]
  const plan = sampleIssuePlan(state, byNumber ? String(byNumber.title ?? byNumber.id) : null)
  if ('skip' in plan) {
    console.log(`Issue "${SAMPLE_ISSUE_TITLE}" left alone: ${plan.skip}.`)
    console.log(apply ? 'Done.' : 'Dry run only. Run again with --apply to write.')
    return
  }

  let cover: number | null = null
  if (plan.create) {
    // Payload requires a cover: borrow the newest issue's, as seed/listing-ranges.ts does.
    const latest = (
      await payload.find({
        collection: 'issues',
        sort: '-issueNumber',
        depth: 0,
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    if (!latest) {
      throw new Error('There is no issue to borrow a cover from. Create one in the admin.')
    }
    cover = typeof latest.cover === 'object' ? latest.cover.id : latest.cover
    console.log(
      `${apply ? 'Creating' : 'Would create'} issue "${SAMPLE_ISSUE_TITLE}": number ${SAMPLE_ISSUE_NUMBER}, cover borrowed from issue ${latest.issueNumber}.`,
    )
  } else {
    console.log(`Issue "${SAMPLE_ISSUE_TITLE}" exists (id ${issue?.id}); finishing what is left.`)
  }

  const slots: Slot[] = buildSlots(SAMPLE_PAGES)
  if (plan.link) {
    console.log(
      `${apply ? 'Linking' : 'Would link'} the template to the issue, which copies ${slots.length} slots and locks the template.`,
    )
  }
  if (plan.prices) {
    console.log('Placeholder prices (TEST VALUES, all on sale):')
    for (const row of PLACEHOLDER_PRICES) {
      console.log(`  ${PAGE_LAYOUT_LABELS[row.layout]}: ${row.price}`)
    }
  } else {
    console.log('The issue already has a price table; left alone.')
  }
  const planned = planBlocks(slots, templateTotals(SAMPLE_PAGES).pages)
  for (const b of planned) {
    console.log(
      `  ${b.governorate}: pages ${b.firstPage}-${b.lastPage} ${apply ? '' : '(would create)'}`,
    )
  }

  if (!apply || !templateId) {
    console.log('Dry run only. Run again with --apply to write.')
    return
  }

  if (plan.create) {
    issue = await payload.create({
      collection: 'issues',
      // The slug is generated by the collection, which the generated type
      // does not know; same cast as seed/listing-ranges.ts.
      data: asData({
        title: SAMPLE_ISSUE_TITLE,
        issueNumber: SAMPLE_ISSUE_NUMBER,
        cover,
        publishedAt: new Date().toISOString(),
      }),
      locale: 'en',
      depth: 0,
      overrideAccess: true,
    })
    console.log(`Created issue ${issue.id}.`)
  }
  if (!issue) throw new Error('No sample issue to work on. Stopping.')

  // Same path as the admin: the issue's hook copies the slots and locks the template.
  let issueSlots = (Array.isArray(issue.slots) ? issue.slots : []) as unknown as Slot[]
  if (plan.link) {
    const linked = await payload.update({
      collection: 'issues',
      id: issue.id,
      data: asData({ template: templateId }),
      locale: 'en',
      depth: 0,
      overrideAccess: true,
    })
    issueSlots = (Array.isArray(linked.slots) ? linked.slots : []) as unknown as Slot[]
  }
  if (issueSlots.length === 0) throw new Error('The issue has no slots after linking. Stopping.')

  if (plan.prices) {
    await payload.update({
      collection: 'issues',
      id: issue.id,
      data: asData({ layouts: PLACEHOLDER_PRICES }),
      locale: 'en',
      depth: 0,
      overrideAccess: true,
    })
  }

  // Blocks come from the slots the issue actually copied.
  const totalPages = Math.max(
    ...issueSlots.map((s) => s.page + (s.layout === 'full-spread' ? 1 : 0)),
  )
  for (const b of planBlocks(issueSlots, totalPages)) {
    await payload.create({
      collection: 'listing-ranges',
      data: asData({
        issue: issue.id,
        governorate: b.governorate,
        firstPage: b.firstPage,
        lastPage: b.lastPage,
      }),
      depth: 0,
      overrideAccess: true,
    })
    console.log(`  created ${b.governorate}: pages ${b.firstPage}-${b.lastPage}`)
  }
  console.log('Done.')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
