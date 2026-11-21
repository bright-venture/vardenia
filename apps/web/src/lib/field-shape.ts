import type { Field } from 'payload'
import { isValidPoint } from '@vardenia/core'

/**
 * Checking a write body against a collection's field config.
 *
 * Used by hooks/guardPartnerListingWrite to refuse anything a partner sends
 * that is not a field of the listing, at any depth, and by
 * hooks/markMediaAttached to find the media a saved document points at.
 * Driven by the config rather than a second hand-written list, so a field a
 * later task adds to a group is accepted there without touching this file, and
 * a key the config does not have is refused wherever it hides.
 */

export type Id = string | number

type Named = Field & { name: string }

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isId = (value: unknown): value is Id =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value))

/**
 * The named data fields at this level, looking through the containers that
 * have no name of their own (rows, collapsibles, unnamed tabs). A named tab is
 * a group by another name and is returned as itself.
 */
export function dataFields(fields: Field[]): Named[] {
  const out: Named[] = []
  for (const field of fields) {
    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        if ('name' in tab && tab.name) out.push({ ...tab, type: 'group' } as unknown as Named)
        else out.push(...dataFields(tab.fields))
      }
      continue
    }
    if ('name' in field && field.name) out.push(field as Named)
    else if ('fields' in field && Array.isArray(field.fields)) out.push(...dataFields(field.fields))
  }
  return out
}

const relatesToMedia = (field: Named): boolean => {
  const to = (field as { relationTo?: string | string[] }).relationTo
  return to === 'media' || (Array.isArray(to) && to.includes('media'))
}

/** A refusal: the dotted path of the offending key and why. */
export class ShapeProblem extends Error {
  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(`"${path}" ${reason}`)
  }
}

/**
 * Check one value against its field, collecting the media ids it names.
 * Throws ShapeProblem on the first key or shape the field does not allow.
 *
 * Unknown keys are refused, never stripped: a client that sends one has a bug
 * or is probing, and either way should be told rather than silently half-saved.
 */
function checkValue(value: unknown, field: Named, path: string, media: Id[]): void {
  if (value === null || value === undefined) return

  switch (field.type) {
    case 'group': {
      if (!isPlainObject(value)) throw new ShapeProblem(path, 'must be an object.')
      checkObject(value, (field as { fields: Field[] }).fields, path, media)
      return
    }
    case 'array': {
      if (!Array.isArray(value)) throw new ShapeProblem(path, 'must be a list.')
      value.forEach((row, index) => {
        const rowPath = `${path}.${index}`
        if (!isPlainObject(row)) throw new ShapeProblem(rowPath, 'must be an object.')
        checkObject(row, (field as { fields: Field[] }).fields, rowPath, media, ['id'])
      })
      return
    }
    case 'blocks': {
      if (!Array.isArray(value)) throw new ShapeProblem(path, 'must be a list.')
      const blocks = (field as { blocks?: { slug: string; fields: Field[] }[] }).blocks ?? []
      value.forEach((row, index) => {
        const rowPath = `${path}.${index}`
        if (!isPlainObject(row)) throw new ShapeProblem(rowPath, 'must be an object.')
        const block = blocks.find((candidate) => candidate.slug === row.blockType)
        if (!block) throw new ShapeProblem(`${rowPath}.blockType`, 'is not a known block.')
        checkObject(row, block.fields, rowPath, media, ['id', 'blockType', 'blockName'])
      })
      return
    }
    case 'upload':
    case 'relationship': {
      const many = (field as { hasMany?: boolean }).hasMany === true
      const values = many ? value : [value]
      if (!Array.isArray(values)) throw new ShapeProblem(path, 'must be a list of ids.')
      values.forEach((entry, index) => {
        const entryPath = many ? `${path}.${index}` : path
        if (!isId(entry)) throw new ShapeProblem(entryPath, 'must be an id.')
        if (relatesToMedia(field)) media.push(entry)
      })
      return
    }
    case 'richText':
      checkRichText(value, path, media)
      return
    case 'point':
      // [longitude, latitude]: two numbers in range, nothing else.
      if (!isValidPoint(value)) {
        throw new ShapeProblem(path, 'must be a point: [longitude, latitude].')
      }
      return
    case 'select': {
      // Only the slugs the field offers, as a list when it takes many.
      const many = (field as { hasMany?: boolean }).hasMany === true
      const offered = ((field as { options?: (string | { value: string })[] }).options ?? []).map(
        (option) => (typeof option === 'string' ? option : option.value),
      )
      const picks = many ? (Array.isArray(value) ? value : [value]) : [value]
      if (!many && Array.isArray(value)) throw new ShapeProblem(path, 'must be a single choice.')
      picks.forEach((pick, index) => {
        const pickPath = Array.isArray(value) ? `${path}.${index}` : path
        if (typeof pick !== 'string' || !offered.includes(pick)) {
          throw new ShapeProblem(pickPath, 'is not one of the choices on offer.')
        }
      })
      return
    }
    case 'ui':
    case 'join':
      throw new ShapeProblem(path, 'is not something that can be saved.')
    default:
      // A leaf (text, select, number, rich text, point...). Payload validates
      // its type; the value is one column and cannot reach another field.
      return
  }
}

/**
 * The Lexical node types a partner's rich text may contain: plain content, and
 * the upload and link nodes, which are checked one by one below. Anything else
 * - relationship, block, a type a future editor feature adds - is refused, so
 * a new node that can point somewhere is never let through by default.
 * `tab` and `horizontalrule` are plain content the default editor produces.
 */
const PARTNER_RICH_TEXT_NODES = new Set([
  'root',
  'paragraph',
  'text',
  'linebreak',
  'tab',
  'horizontalrule',
  'heading',
  'quote',
  'list',
  'listitem',
  'upload',
  'link',
  'autolink',
])

/** Deeper than any editor nests a paragraph; refused rather than walked. */
const MAX_RICH_TEXT_DEPTH = 40

/**
 * A link a partner may put in rich text: web, mail or phone, absolute.
 * Whitespace and control characters are removed first, because a browser
 * ignores them inside a scheme (`java\tscript:` runs as `javascript:`).
 */
export function isSafeLinkUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false
  const compact = url.replace(/[\u0000-\u0020\u007f-\u00a0]/g, '').toLowerCase()
  return /^(https?:\/\/[^/]|mailto:|tel:)/.test(compact)
}

const lexicalId = (value: unknown): Id | null =>
  isId(value) ? value : isPlainObject(value) && isId(value.id) ? value.id : null

/**
 * Lexical JSON from a partner. The editor keeps Payload's upload,
 * relationship and link nodes, and each can point somewhere:
 *
 *  - `upload` must be media; its id joins the others, so the own-media rule
 *    applies to it exactly as to the gallery.
 *  - Every other node type outside PARTNER_RICH_TEXT_NODES is refused
 *    (default-deny), and a plain node may not carry `relationTo`, `fields`,
 *    `doc` or `value` (except a list item's number).
 *  - `link` and `autolink` must be a custom http(s), mailto or tel URL; an
 *    internal link (to a document) is refused, as is any other scheme.
 *
 * Text and formatting nodes pass. The tree is walked through every
 * `children`, with a depth limit.
 */
function checkRichText(value: unknown, path: string, media: Id[]): void {
  if (!isPlainObject(value) || !isPlainObject(value.root)) {
    throw new ShapeProblem(path, 'must be rich text.')
  }
  const walk = (node: unknown, depth: number) => {
    if (depth > MAX_RICH_TEXT_DEPTH) throw new ShapeProblem(path, 'is nested too deeply.')
    if (!isPlainObject(node)) throw new ShapeProblem(path, 'contains something that is not text.')
    const type = node.type
    if (typeof type !== 'string' || !PARTNER_RICH_TEXT_NODES.has(type)) {
      throw new ShapeProblem(path, `cannot contain a ${String(type ?? 'untyped')} element.`)
    }

    if (type === 'upload') {
      const id = lexicalId(node.value)
      if (node.relationTo !== 'media' || id === null) {
        throw new ShapeProblem(path, 'may only show photos and files from your own uploads.')
      }
      media.push(id)
    } else if (type === 'link' || type === 'autolink') {
      const fields = isPlainObject(node.fields) ? node.fields : {}
      if (fields.linkType === 'internal' || fields.doc !== undefined) {
        throw new ShapeProblem(path, 'cannot link to another page of the site.')
      }
      if (!isSafeLinkUrl(fields.url)) {
        throw new ShapeProblem(path, 'may only link to a web address, an email or a phone number.')
      }
      if ('relationTo' in node || 'value' in node || 'doc' in node) {
        throw new ShapeProblem(path, 'cannot contain a link to a document.')
      }
    } else {
      // Plain content: nothing that points anywhere. A list item's `value`
      // is its number in the list, and is the one `value` allowed.
      const listNumber =
        type === 'listitem' && (node.value === undefined || typeof node.value === 'number')
      if (
        'relationTo' in node ||
        'fields' in node ||
        'doc' in node ||
        ('value' in node && !listNumber)
      ) {
        throw new ShapeProblem(path, `has a ${type} element pointing somewhere.`)
      }
    }

    if (type === 'root' && depth !== 1) throw new ShapeProblem(path, 'has a misplaced root.')
    if (node.children !== undefined) {
      if (!Array.isArray(node.children)) throw new ShapeProblem(path, 'is not valid rich text.')
      for (const child of node.children) walk(child, depth + 1)
    }
  }
  // The editor state is `{ root: {...} }`; the root and everything under it
  // are nodes.
  walk(value.root, 1)
}

/** Media ids in Lexical upload nodes, tolerant (for a saved document). */
function richTextMedia(value: unknown, out: Id[], depth = 0): void {
  if (!isPlainObject(value) || depth > MAX_RICH_TEXT_DEPTH * 2) return
  if (value.type === 'upload' && value.relationTo === 'media') {
    const id = lexicalId(value.value)
    if (id !== null) out.push(id)
  }
  if (value.root !== undefined) richTextMedia(value.root, out, depth + 1)
  if (Array.isArray(value.children)) {
    for (const child of value.children) richTextMedia(child, out, depth + 1)
  }
}

function checkObject(
  value: Record<string, unknown>,
  fields: Field[],
  path: string,
  media: Id[],
  extraKeys: string[] = [],
): void {
  const known = new Map(dataFields(fields).map((field) => [field.name, field]))
  for (const [key, sub] of Object.entries(value)) {
    const subPath = path ? `${path}.${key}` : key
    if (extraKeys.includes(key)) {
      if (sub !== null && sub !== undefined && !isId(sub)) {
        throw new ShapeProblem(subPath, 'must be a plain id.')
      }
      continue
    }
    const field = known.get(key)
    if (!field) throw new ShapeProblem(subPath, 'is not a field you can change.')
    checkValue(sub, field, subPath, media)
  }
}

/**
 * Check a write body against an allow-list of top-level names and the field
 * config beneath them. Returns the media ids the body names, in order.
 */
export function checkAllowedBody(data: unknown, fields: Field[], allowed: readonly string[]): Id[] {
  if (!isPlainObject(data)) throw new ShapeProblem('body', 'must be an object of fields.')
  const media: Id[] = []
  const known = new Map(dataFields(fields).map((field) => [field.name, field]))
  for (const [key, value] of Object.entries(data)) {
    const field = known.get(key)
    if (!allowed.includes(key) || !field) {
      throw new ShapeProblem(key, 'cannot be changed from a partner account.')
    }
    checkValue(value, field, key, media)
  }
  return media
}

/**
 * Every media id a saved document points at, through groups, arrays and
 * blocks. Tolerant where the check above is strict: a populated relation
 * (`{ id, url, ... }`) counts by its id, and anything unreadable is skipped.
 * Rich text is searched for Lexical upload nodes.
 */
export function mediaIdsIn(doc: unknown, fields: Field[]): Id[] {
  const out: Id[] = []
  const walk = (value: unknown, levelFields: Field[]) => {
    if (!isPlainObject(value)) return
    for (const field of dataFields(levelFields)) {
      const sub = value[field.name]
      if (sub === null || sub === undefined) continue
      if (field.type === 'group') walk(sub, (field as { fields: Field[] }).fields)
      else if (field.type === 'array' && Array.isArray(sub)) {
        for (const row of sub) walk(row, (field as { fields: Field[] }).fields)
      } else if (field.type === 'blocks' && Array.isArray(sub)) {
        const blocks = (field as { blocks?: { slug: string; fields: Field[] }[] }).blocks ?? []
        for (const row of sub) {
          const block = blocks.find((b) => isPlainObject(row) && b.slug === row.blockType)
          if (block) walk(row, block.fields)
        }
      } else if (field.type === 'richText') {
        // A localized field read with locale 'all' is { en: {...}, fr: {...} }.
        if (isPlainObject(sub) && !('root' in sub)) {
          for (const perLocale of Object.values(sub)) richTextMedia(perLocale, out)
        } else richTextMedia(sub, out)
      } else if (
        (field.type === 'upload' || field.type === 'relationship') &&
        relatesToMedia(field)
      ) {
        for (const entry of Array.isArray(sub) ? sub : [sub]) {
          const id = isId(entry) ? entry : isPlainObject(entry) ? entry.id : null
          if (isId(id)) out.push(id)
        }
      }
    }
  }
  walk(doc, fields)
  return out
}
