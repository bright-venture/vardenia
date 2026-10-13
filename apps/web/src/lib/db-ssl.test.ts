import { describe, expect, it } from 'vitest'
import { databaseSsl } from './db-ssl'

describe('databaseSsl', () => {
  it('always encrypts, even before the CA is configured', () => {
    expect(databaseSsl({})).toEqual({ rejectUnauthorized: false })
  })

  it('verifies the certificate once the CA is set, accepting one-line PEMs', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----'
    expect(databaseSsl({ DATABASE_CA_CERT: pem })).toEqual({
      ca: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
      rejectUnauthorized: true,
    })
  })
})
