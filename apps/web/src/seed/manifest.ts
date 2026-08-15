import { readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * A record of what the seed created, so reset can remove that and only that.
 *
 * The first version of reset matched on slug, which is wrong in a way that only
 * shows up on a database somebody has already worked in. Run against a real one,
 * the seed found an existing `summer-2026` issue, skipped creating its own and
 * carried on - and reset would then have deleted that issue, because the slug
 * matched. Same hazard for any page called `about`.
 *
 * Slugs describe what a document is. They say nothing about who made it. So the
 * seed writes down the ids it actually inserted, and reset refuses to guess when
 * that record is missing.
 *
 * Gitignored, and local to the machine that ran the seed. That is the correct
 * scope: it describes one database, not the project.
 */

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.seed-manifest.json')

export type ManifestCollection =
  'businesses' | 'articles' | 'issues' | 'pages' | 'media' | 'qr-codes' | 'scan-events' | 'users'

export interface Manifest {
  /** When the seed ran, for a human reading the file. */
  createdAt: string
  /** Ids inserted, per collection. */
  created: Partial<Record<ManifestCollection, (number | string)[]>>
}

export function emptyManifest(): Manifest {
  return { createdAt: new Date().toISOString(), created: {} }
}

export function record(manifest: Manifest, collection: ManifestCollection, id: number | string) {
  const list = manifest.created[collection] ?? []
  if (!list.includes(id)) list.push(id)
  manifest.created[collection] = list
}

export function idsFor(manifest: Manifest, collection: ManifestCollection): (number | string)[] {
  return manifest.created[collection] ?? []
}

export async function saveManifest(manifest: Manifest): Promise<string> {
  await writeFile(FILE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return FILE
}

/** Returns null when there is nothing on disk, which reset treats as a refusal. */
export async function loadManifest(): Promise<Manifest | null> {
  try {
    const raw = await readFile(FILE, 'utf8')
    const parsed = JSON.parse(raw) as Manifest
    if (!parsed || typeof parsed !== 'object' || !parsed.created) return null
    return parsed
  } catch {
    return null
  }
}

export async function clearManifest(): Promise<void> {
  try {
    await unlink(FILE)
  } catch {
    // Already gone. Nothing to do.
  }
}

export const MANIFEST_PATH = FILE
