/**
 * The machine-translation seam.
 *
 * One small adapter over a translation endpoint, so the auto-translate hook and
 * the backfill do not know or care which engine is behind it. It speaks the
 * LibreTranslate HTTP shape, which is what a free, self-hosted container exposes
 * with no API key - point `LIBRETRANSLATE_URL` at it (for example
 * `http://localhost:5000`) and translation is on; leave it unset and every
 * function here is a no-op, so the CMS behaves exactly as it did before.
 *
 * A hosted LibreTranslate that requires a key reads `LIBRETRANSLATE_API_KEY`;
 * self-hosted needs neither. Nothing else in the app calls a translation API, so
 * swapping the engine is changing this one file.
 *
 * The output is machine translation and is worth a native review before launch.
 */

const ENDPOINT = process.env.LIBRETRANSLATE_URL?.replace(/\/$/, '')
const API_KEY = process.env.LIBRETRANSLATE_API_KEY

/** Whether an engine is configured. When false, callers do nothing. */
export function translationConfigured(): boolean {
  return Boolean(ENDPOINT)
}

/**
 * Translate one string. Returns null when there is no engine, nothing to
 * translate, or the engine has no model for the pair - the caller then leaves
 * the field to fall back to English rather than writing a broken value.
 */
export async function translateText(
  text: string,
  source: string,
  target: string,
): Promise<string | null> {
  if (!ENDPOINT || !text.trim()) return null
  const res = await fetch(`${ENDPOINT}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      source,
      target,
      format: 'text',
      ...(API_KEY ? { api_key: API_KEY } : {}),
    }),
  })
  if (!res.ok) throw new Error(`translate ${source}->${target} failed: ${res.status}`)
  const data = (await res.json()) as { translatedText?: string }
  return data.translatedText ?? null
}

type LexicalNode = {
  type?: string
  text?: string
  children?: LexicalNode[]
  [key: string]: unknown
}

/** Every text node in a Lexical tree, in document order. */
function textNodes(node: LexicalNode | null | undefined, out: LexicalNode[] = []): LexicalNode[] {
  if (!node || typeof node !== 'object') return out
  if (node.type === 'text' && typeof node.text === 'string') out.push(node)
  if (Array.isArray(node.children)) for (const child of node.children) textNodes(child, out)
  return out
}

/**
 * Translate a Lexical rich-text value, preserving its structure.
 *
 * Only the `text` on text nodes is translated; every wrapper, mark and format is
 * copied unchanged, so a translated description keeps the paragraphs and styling
 * the editor gave the English one. Returns null when there is no engine or the
 * value carries no text.
 */
export async function translateRichText(
  value: unknown,
  source: string,
  target: string,
): Promise<unknown | null> {
  if (!ENDPOINT || !value || typeof value !== 'object') return null
  const clone = structuredClone(value) as { root?: LexicalNode }
  const nodes = textNodes(clone.root)
  if (nodes.length === 0) return null

  let translatedAny = false
  for (const node of nodes) {
    const translated = await translateText(node.text as string, source, target)
    if (translated != null) {
      node.text = translated
      translatedAny = true
    }
  }
  return translatedAny ? clone : null
}
