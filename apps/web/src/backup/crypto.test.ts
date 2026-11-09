import { describe, expect, it } from 'vitest'
import {
  decryptBytes,
  encryptBytes,
  generateBackupKeys,
  isEncrypted,
  readPrivateKey,
  readPublicKey,
} from './crypto'

/**
 * The weekly backup's encryption: a file locked with the public key opens only
 * with its private key, and any change to it is caught rather than restored as
 * quietly wrong data.
 */

const keys = generateBackupKeys()
const publicKey = readPublicKey(keys.publicKeyLine)
const privateKey = readPrivateKey(keys.privateKeyPem)
const other = readPrivateKey(generateBackupKeys().privateKeyPem)

const plain = Buffer.from('{"id":1,"email":"guest@example.com","notes":"Nut allergy"}\n')

describe('backup encryption', () => {
  it('locks a file so the plain text is not in it, and opens it again', () => {
    const locked = encryptBytes(plain, publicKey)
    expect(isEncrypted(locked)).toBe(true)
    expect(locked.includes(Buffer.from('guest@example.com'))).toBe(false)
    expect(decryptBytes(locked, privateKey).equals(plain)).toBe(true)
  })

  it('gives every file its own key, so two copies of the same bytes differ', () => {
    expect(encryptBytes(plain, publicKey).equals(encryptBytes(plain, publicKey))).toBe(false)
  })

  it('handles an empty file and a large binary one', () => {
    expect(decryptBytes(encryptBytes(Buffer.alloc(0), publicKey), privateKey).length).toBe(0)
    const photo = Buffer.alloc(3 * 1024 * 1024, 7)
    expect(decryptBytes(encryptBytes(photo, publicKey), privateKey).equals(photo)).toBe(true)
  })

  it('will not open with another private key', () => {
    expect(() => decryptBytes(encryptBytes(plain, publicKey), other)).toThrow()
  })

  it('refuses a file changed by a single byte', () => {
    const locked = encryptBytes(plain, publicKey)
    locked.writeUInt8(locked.readUInt8(locked.length - 1) ^ 1, locked.length - 1)
    expect(() => decryptBytes(locked, privateKey)).toThrow()
  })

  it('refuses something that is not a locked file', () => {
    expect(isEncrypted(plain)).toBe(false)
    expect(() => decryptBytes(plain, privateKey)).toThrow('Not an encrypted backup file.')
  })

  it('reads the public key from one env line or from a PEM', () => {
    const pem = publicKey.export({ format: 'pem', type: 'spki' }).toString()
    expect(() => readPublicKey(pem)).not.toThrow()
    expect(() => readPublicKey('')).toThrow()
    expect(keys.publicKeyLine).not.toContain('\n')
  })
})
