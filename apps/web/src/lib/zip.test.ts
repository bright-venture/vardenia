import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createZip, crc32, safeFileName } from './zip'

/**
 * The ZIP writer, checked by having something else open the archive.
 *
 * # Why a second implementation reads it back
 *
 * A test that reads the bytes back with my own parser proves only that I am
 * consistent, not that I am right. A ZIP is opened by Windows Explorer, by macOS
 * Archive Utility, by whatever the designer uses - none of which share my reading
 * of the spec. So the archives below are handed to fflate's `unzipSync`, an
 * independent implementation that parses the central directory, follows each
 * entry's offset to its local header, and returns the bytes it finds. If our
 * offsets, sizes or name flags are wrong, an independent reader is what shows it.
 *
 * This used to shell out to Python's `zipfile`, which meant the suite failed on
 * any machine without Python on the PATH. fflate is the same kind of check - a
 * separate codebase's reading of the format - with no external binary.
 *
 * The one thing fflate does not do is re-check the CRC of stored data, so that
 * guarantee is kept where it belongs: the `crc32` describe below pins the writer
 * against the format's published check value, which every implementation agrees
 * on. A malformed archive is worse than no archive: it downloads happily and
 * fails when somebody opens it, quite possibly on the day it is needed.
 */

const utf8 = (text: string) => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

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

    const out = unzipSync(zip)
    expect(Object.keys(out).sort()).toEqual(['first.txt', 'second.txt'])
    expect(decode(out['first.txt']!)).toBe('hello')
    expect(decode(out['second.txt']!)).toBe('world')
  })

  it('makes a folder out of a slash in the name', () => {
    const zip = createZip([{ name: 'codes/svg/one.txt', data: utf8('x') }])
    expect(decode(unzipSync(zip)['codes/svg/one.txt']!)).toBe('x')
  })

  it('keeps a non-ASCII name readable', () => {
    // Only decoded back to Arabic if the UTF-8 name flag (bit 11) is set; an
    // independent reader honouring that flag is the point of the assertion.
    const zip = createZip([{ name: 'مطعم-K3M9QP2.txt', data: utf8('arabic') }])
    expect(decode(unzipSync(zip)['مطعم-K3M9QP2.txt']!)).toBe('arabic')
  })

  it('handles an empty file', () => {
    const zip = createZip([{ name: 'empty.txt', data: new Uint8Array(0) }])
    const out = unzipSync(zip)
    expect(out['empty.txt']).toBeDefined()
    expect(out['empty.txt']!.length).toBe(0)
  })

  it('handles an archive with nothing in it', () => {
    expect(Object.keys(unzipSync(createZip([])))).toHaveLength(0)
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

    const out = unzipSync(createZip(entries))
    expect(Object.keys(out)).toHaveLength(60)
    for (const { name, data } of entries) {
      expect(out[name]!).toEqual(data)
    }
  })

  /** Binary, because a PNG is what the export actually ships. */
  it('survives bytes that are not text', () => {
    const data = new Uint8Array(512)
    for (let i = 0; i < data.length; i += 1) data[i] = (i * 7) % 256

    const zip = createZip([{ name: 'binary.bin', data }])
    expect(unzipSync(zip)['binary.bin']!).toEqual(data)
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
