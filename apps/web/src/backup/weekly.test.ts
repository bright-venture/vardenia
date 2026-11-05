import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  humanBytes,
  isInside,
  localObjectPath,
  needsDownload,
  quoteIdent,
  runFolderName,
} from './weekly'

/** The parts of the weekly backup that decide where things go and what is fetched. */

describe('the run folder', () => {
  it('is named after the day in Beirut, not in London', () => {
    // 23:30 UTC on 8 Nov is already 9 Nov in Beirut.
    expect(runFolderName(new Date('2026-11-08T23:30:00Z'))).toBe('2026-11-09')
    expect(runFolderName(new Date('2026-11-09T08:00:00Z'))).toBe('2026-11-09')
  })
})

describe('keeping personal data out of the repository', () => {
  const repo = path.resolve('/work/vardenia')

  it('sees a folder inside the repo, the repo itself included', () => {
    expect(isInside(path.join(repo, 'backups', 'weekly'), repo)).toBe(true)
    expect(isInside(repo, repo)).toBe(true)
  })

  it('lets a folder next to the repo through, even with a similar name', () => {
    expect(isInside(path.resolve('/work/backups/weekly'), repo)).toBe(false)
    expect(isInside(path.resolve('/work/vardenia-backups'), repo)).toBe(false)
  })
})

describe('where an object is kept', () => {
  const root = path.resolve('/b/files/media')

  it('mirrors the key under the bucket folder', () => {
    expect(localObjectPath(root, 'a1b2c3.webp')).toBe(path.join(root, 'a1b2c3.webp'))
    expect(localObjectPath(root, 'sizes/a1b2c3-card.webp')).toBe(
      path.join(root, 'sizes', 'a1b2c3-card.webp'),
    )
  })

  it('refuses a key that climbs out of the folder', () => {
    expect(localObjectPath(root, '../../secrets.txt')).toBeNull()
    expect(localObjectPath(root, 'a/../../x')).toBeNull()
    expect(localObjectPath(root, '/etc/passwd')).toBeNull()
  })

  it('refuses names Windows cannot store, and folder markers', () => {
    expect(localObjectPath(root, 'a:b.jpg')).toBeNull()
    expect(localObjectPath(root, 'trailing.')).toBeNull()
    expect(localObjectPath(root, 'folder/')).toBeNull()
    expect(localObjectPath(root, '')).toBeNull()
  })
})

describe('what is fetched', () => {
  it('fetches what is missing or arrived cut short, and nothing else', () => {
    expect(needsDownload(null, 120)).toBe(true)
    expect(needsDownload(60, 120)).toBe(true)
    expect(needsDownload(120, 120)).toBe(false)
  })
})

describe('small helpers', () => {
  it('quotes a table name, doubling any quote in it', () => {
    expect(quoteIdent('businesses')).toBe('"businesses"')
    expect(quoteIdent('we"ird')).toBe('"we""ird"')
  })

  it('reads sizes the way a person does', () => {
    expect(humanBytes(512)).toBe('512 B')
    expect(humanBytes(838_860_800)).toBe('800.0 MB')
  })
})
