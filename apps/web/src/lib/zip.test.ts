import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createZip, crc32, safeFileName } from './zip'

/**
 * The ZIP writer, checked by having something else open the archive.
 *
 * # Why the tests shell out
 *
 * Because a test that reads the bytes back with my own parser proves only that
 * I am consistent, not that I am right. A ZIP is opened by Windows Explorer, by
 * macOS Archive Utility, by whatever the designer uses - none of which share my
 * reading of the spec. So the archives below are handed to Python's `zipfile`,
 * which is an independent implementation that has been wrong-file-detecting for
 * twenty years, and asked to list, verify and extract them.
 *
 * A malformed archive is worse than no archive: it downloads happily and fails
 * when somebody opens it, quite possibly on the day it is needed.
 */

const utf8 = (text: string) => new TextEncoder().encode(text)

/** Runs Python against the archive and returns whatever it prints. */
function inspect(zip: Uint8Array, script: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'vardenia-zip-'))
  const archive = path.join(dir, 'test.zip')

  try {
    writeFileSync(archive, zip)

    /**
     * PYTHONIOENCODING, and the newline squash, are both Windows.
     *
     * Python writing an Arabic filename to a cp1252 console throws rather than
     * printing, and `print` emits CRLF - which turned "OK" into "OK
" and
     * failed three tests that had nothing wrong with the archive.
     */
    return execFileSync('python', ['-c', script, archive], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
      .replace(/\r\n/g, '\n')
      .trim()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const LIST = `
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    bad = z.testzip()
    print('CORRUPT:' + bad if bad else 'OK')
    for name in z.namelist():
        print(name + '|' + z.read(name).decode('utf-8'))
`

describe('crc32', () => {
  /** The published check value for this input, which every CRC-32 agrees on. */
  it('matches the standard check value', () => {
    expect(crc32(utf8('123456789')).toString(16)).toBe('cbf43926')
  })

  it('is zero for nothing', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })
})

describe('an archive a real unzip can open', () => {
  it('lists and extracts every file intact', () => {
    const zip = createZip([
      { name: 'first.txt', data: utf8('hello') },
      { name: 'second.txt', data: utf8('world') },
    ])

    const out = inspect(zip, LIST).split('\n')
    expect(out[0]).toBe('OK')
    expect(out).toContain('first.txt|hello')
    expect(out).toContain('second.txt|world')
  })

  it('makes a folder out of a slash in the name', () => {
    const zip = createZip([{ name: 'codes/svg/one.txt', data: utf8('x') }])
    expect(inspect(zip, LIST)).toContain('codes/svg/one.txt|x')
  })

  it('keeps a non-ASCII name readable', () => {
    const zip = createZip([{ name: 'مطعم-K3M9QP2.txt', data: utf8('arabic') }])
    expect(inspect(zip, LIST)).toContain('مطعم-K3M9QP2.txt|arabic')
  })

  it('handles an empty file', () => {
    const zip = createZip([{ name: 'empty.txt', data: new Uint8Array(0) }])
    expect(inspect(zip, LIST).split('\n')[0]).toBe('OK')
  })

  it('handles an archive with nothing in it', () => {
    const out = inspect(
      createZip([]),
      `
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    print('OK', len(z.namelist()))
`,
    )
    expect(out).toBe('OK 0')
  })

  /**
   * Every entry's central directory record points at where its local header
   * starts. Getting that arithmetic wrong is the classic ZIP bug, and it does
   * not show up until an archive has enough entries for an offset to drift.
   */
  it('keeps its offsets right across many files of differing sizes', () => {
    const entries = Array.from({ length: 60 }, (_, index) => ({
      name: `file-${index}.txt`,
      data: utf8('x'.repeat(index * 37)),
    }))

    const out = inspect(
      createZip(entries),
      `
import sys, zipfile
with sys.argv[1] and zipfile.ZipFile(sys.argv[1]) as z:
    assert z.testzip() is None, 'corrupt'
    sizes = {i.filename: i.file_size for i in z.infolist()}
    ok = all(len(z.read(n)) == s for n, s in sizes.items())
    print('OK' if ok else 'MISMATCH', len(sizes))
`,
    )
    expect(out).toBe('OK 60')
  })

  /** Binary, because a PNG is what the export actually ships. */
  it('survives bytes that are not text', () => {
    const data = new Uint8Array(512)
    for (let i = 0; i < data.length; i += 1) data[i] = (i * 7) % 256

    const zip = createZip([{ name: 'binary.bin', data }])
    const dir = mkdtempSync(path.join(tmpdir(), 'vardenia-zip-'))

    try {
      const archive = path.join(dir, 'test.zip')
      writeFileSync(archive, zip)
      execFileSync('python', [
        '-c',
        `import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z: z.extractall(sys.argv[2])`,
        archive,
        dir,
      ])

      expect(new Uint8Array(readFileSync(path.join(dir, 'binary.bin')))).toEqual(data)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('safeFileName', () => {
  /**
   * The one that would silently lose files. A slash in a business name makes a
   * folder, so `Chez Sami / Jounieh` and `Chez Sami / Kaslik` would become two
   * files in a folder rather than two named codes.
   */
  it('flattens a slash rather than making a folder', () => {
    expect(safeFileName('Chez Sami / Jounieh')).toBe('Chez Sami Jounieh')
  })

  it('removes the characters Windows refuses', () => {
    expect(safeFileName('a:b"c<d>e|f?g*h')).toBe('a b c d e f g h')
  })

  it('keeps a backslash out, which a path would otherwise swallow', () => {
    expect(safeFileName('a\\b')).toBe('a b')
  })

  it('keeps letters, digits, hyphens and dots', () => {
    expect(safeFileName('Faraya 797 Chalets - v2.1')).toBe('Faraya 797 Chalets - v2.1')
  })

  it('keeps a non-Latin name', () => {
    expect(safeFileName('مطعم بيروت')).toBe('مطعم بيروت')
  })

  it('drops a trailing dot or space, which Windows would drop anyway', () => {
    expect(safeFileName('name. ')).toBe('name')
  })

  it('falls back rather than returning nothing', () => {
    expect(safeFileName('///')).toBe('untitled')
    expect(safeFileName('   ', 'code')).toBe('code')
  })
})
