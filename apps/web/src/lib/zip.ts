/**
 * A ZIP file, written by hand, with no compression.
 *
 * # Why not a library
 *
 * The same reason lib/csv-parse is not one: this repository has just spent a day
 * getting its advisory count down, and a zip library is a large dependency for
 * something the format makes easy. Store-only ZIP is three record types and a
 * CRC, all of them fixed-layout.
 *
 * The trade is real and worth stating: no compression, so a folder of SVG codes
 * is about as large as the files are. For a few hundred QR codes that is a few
 * megabytes, which is not worth a dependency to halve. If somebody ever needs to
 * ship a hundred megabytes this should become a library rather than grow a
 * deflate implementation.
 *
 * # Why correctness here is not obvious
 *
 * A malformed archive is worse than no archive: it downloads happily and fails
 * when somebody opens it, possibly on the day it is needed. So zip.test.ts does
 * not check the bytes against my own reading of the spec - it writes an archive
 * and has the operating system's own unzip open it. A test that only agreed
 * with the implementation would be worthless.
 */

/** The CRC-32 table, built once. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)

  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }

  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  /** Path inside the archive. Forward slashes make a folder. */
  name: string
  data: Uint8Array
}

/**
 * MS-DOS packed date and time, which is what ZIP stores.
 *
 * Seconds have one bit less than they need, so the format keeps them in units
 * of two. Years count from 1980; anything earlier cannot be represented and is
 * clamped rather than wrapping into a date in the future.
 */
function dosDateTime(when: Date): { date: number; time: number } {
  const year = Math.max(1980, when.getFullYear())
  return {
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2),
  }
}

/** UTF-8 file names, which needs bit 11 set so a reader does not assume CP437. */
const UTF8_NAMES = 0x0800
const STORED = 0

export function createZip(entries: ZipEntry[], now = new Date()): Uint8Array {
  const { date, time } = dosDateTime(now)
  const encoder = new TextEncoder()

  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    const local = new Uint8Array(30 + name.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true) // local file header signature
    localView.setUint16(4, 20, true) // version needed
    localView.setUint16(6, UTF8_NAMES, true)
    localView.setUint16(8, STORED, true)
    localView.setUint16(10, time, true)
    localView.setUint16(12, date, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, size, true) // compressed
    localView.setUint32(22, size, true) // uncompressed
    localView.setUint16(26, name.length, true)
    localView.setUint16(28, 0, true) // extra field length
    local.set(name, 30)

    locals.push(local, entry.data)

    const central = new Uint8Array(46 + name.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true) // central directory signature
    centralView.setUint16(4, 20, true) // version made by
    centralView.setUint16(6, 20, true) // version needed
    centralView.setUint16(8, UTF8_NAMES, true)
    centralView.setUint16(10, STORED, true)
    centralView.setUint16(12, time, true)
    centralView.setUint16(14, date, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, size, true)
    centralView.setUint32(24, size, true)
    centralView.setUint16(28, name.length, true)
    centralView.setUint16(30, 0, true) // extra
    centralView.setUint16(32, 0, true) // comment
    centralView.setUint16(34, 0, true) // disk number
    centralView.setUint16(36, 0, true) // internal attributes
    centralView.setUint32(38, 0, true) // external attributes
    centralView.setUint32(42, offset, true) // where the local header is
    central.set(name, 46)

    centrals.push(central)
    offset += local.length + size
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)

  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true) // end of central directory signature
  endView.setUint16(8, entries.length, true) // entries on this disk
  endView.setUint16(10, entries.length, true) // entries in total
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true) // where the central directory starts

  const parts = [...locals, ...centrals, end]
  const total = parts.reduce((sum, part) => sum + part.length, 0)

  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }

  return out
}

/**
 * A file name that survives Windows, macOS and a zip listing.
 *
 * The reserved characters are not decoration: a QR code sheet includes business
 * names, and `Chez Sami / Jounieh` would otherwise create a folder called
 * `Chez Sami` containing a file called `Jounieh`.
 */
export function safeFileName(name: string, fallback = 'untitled'): string {
  const cleaned = name
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Windows silently drops a trailing dot or space, which turns two distinct
    // names into one and loses a file.
    .replace(/[. ]+$/, '')

  return cleaned || fallback
}
