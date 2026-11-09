import {
  constants,
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  type KeyObject,
} from 'node:crypto'

/**
 * Encryption for the weekly full backup, which holds guests' personal data,
 * bookings and receipts.
 *
 * # Locked with one key, opened with another
 *
 * The backup job uses only the PUBLIC key, which can lock a file and cannot
 * open one. The PRIVATE key, the only thing that opens them, is a separate
 * file. On 9 November 2026 the owner chose to keep it on the backup computer,
 * in its own folder (Desktop\Vardenia\backup-key), rather than on a USB stick.
 * So a copy of the backup folder alone, or the backup disk on its own, gives
 * away nothing readable; the computer as a whole, key included, does. Moving
 * the key elsewhere later needs no change here.
 *
 * # How a file is locked
 *
 * Each file gets its own random 256-bit key and is encrypted with AES-256-GCM,
 * which also detects any change to the file. That file key is then locked with
 * the RSA public key (OAEP, SHA-256) and stored at the head of the file. Every
 * file stands alone: one damaged file loses one file, and a file can be opened
 * without any other.
 *
 * Layout: "VDBK1" | key length (2 bytes) | locked key | iv (12) | tag (16) | data
 */

const MAGIC = Buffer.from('VDBK1')
const IV_BYTES = 12
const TAG_BYTES = 16
const RSA_BITS = 4096

/** The suffix every locked file carries, so a plain file is never mistaken for one. */
export const ENCRYPTED_SUFFIX = '.enc'

/** Whether these bytes are a file locked by this module. */
export function isEncrypted(data: Uint8Array): boolean {
  return data.length > MAGIC.length && Buffer.from(data.subarray(0, MAGIC.length)).equals(MAGIC)
}

/**
 * The public key as it is kept in `.env.prod` (BACKUP_PUBLIC_KEY): one line of
 * base64, because a multi-line PEM does not survive an env file. A PEM is also
 * accepted, for a key pasted by hand.
 */
export function readPublicKey(value: string): KeyObject {
  const text = value.trim()
  if (!text) throw new Error('The backup public key is empty.')
  return text.includes('BEGIN')
    ? createPublicKey(text)
    : createPublicKey({ key: Buffer.from(text, 'base64'), format: 'der', type: 'spki' })
}

/** The private key from its PEM file, kept apart from the backups themselves. */
export function readPrivateKey(pem: string): KeyObject {
  return createPrivateKey(pem)
}

/** Locks one file's bytes with the public key. */
export function encryptBytes(plain: Uint8Array, publicKey: KeyObject): Buffer {
  const fileKey = randomBytes(32)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', fileKey, iv)
  const data = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  const lockedKey = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    fileKey,
  )
  const length = Buffer.alloc(2)
  length.writeUInt16BE(lockedKey.length)
  return Buffer.concat([MAGIC, length, lockedKey, iv, tag, data])
}

/**
 * Opens one locked file with the private key. Throws if the file is not one,
 * the key is not the right one, or a single byte of it has been changed.
 */
export function decryptBytes(locked: Uint8Array, privateKey: KeyObject): Buffer {
  const buffer = Buffer.from(locked)
  if (!isEncrypted(buffer)) throw new Error('Not an encrypted backup file.')
  let at = MAGIC.length
  const keyLength = buffer.readUInt16BE(at)
  at += 2
  const lockedKey = buffer.subarray(at, at + keyLength)
  at += keyLength
  const iv = buffer.subarray(at, at + IV_BYTES)
  at += IV_BYTES
  const tag = buffer.subarray(at, at + TAG_BYTES)
  at += TAG_BYTES
  if (at > buffer.length) throw new Error('The encrypted file is cut short.')
  const fileKey = privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    lockedKey,
  )
  const decipher = createDecipheriv('aes-256-gcm', fileKey, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(buffer.subarray(at)), decipher.final()])
}

/**
 * A new key pair: the public key as the one line `.env.prod` takes, and the
 * private key as a PEM file kept apart from the backups.
 */
export function generateBackupKeys(): { publicKeyLine: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: RSA_BITS })
  return {
    publicKeyLine: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  }
}
