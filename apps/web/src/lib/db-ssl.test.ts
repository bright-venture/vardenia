import { describe, expect, it } from 'vitest'
import { databaseSsl, normalizePem } from './db-ssl'

/**
 * Supabase Root 2021 CA: the public certificate every Supabase project signs
 * its database with, exactly as the dashboard's download gives it. Public by
 * design, so safe to keep here.
 */
const ROOT_LINES = [
  '-----BEGIN CERTIFICATE-----',
  'MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL',
  'BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l',
  'dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh',
  'c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow',
  'azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD',
  'YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug',
  'Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW',
  'QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q',
  'DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2',
  'GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi',
  'cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4',
  'O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt',
  'NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX',
  'uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt',
  'aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU',
  'tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b',
  'VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6',
  'jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx',
  'Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2',
  'CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P',
  'o/bKiIz+Fq8=',
  '-----END CERTIFICATE-----',
]
const PEM = ROOT_LINES.join('\n')

describe('databaseSsl', () => {
  it('always encrypts, even before the CA is configured', () => {
    expect(databaseSsl({})).toEqual({ rejectUnauthorized: false })
    expect(databaseSsl({ DATABASE_CA_CERT: '   ' })).toEqual({ rejectUnauthorized: false })
  })

  it('verifies the certificate once the CA is set', () => {
    expect(databaseSsl({ DATABASE_CA_CERT: PEM })).toEqual({ ca: PEM, rejectUnauthorized: true })
  })

  /**
   * The production deploy failure: the same certificate, stored by a host in a
   * different shape, came back unreadable and every connection was refused as
   * "self-signed". Every shape below must come out as the same standard PEM.
   */
  it.each([
    ['one line, with literal \\n', ROOT_LINES.join('\\n')],
    ['line breaks turned into spaces', ROOT_LINES.join(' ')],
    ['line breaks removed', ROOT_LINES.join('')],
    ['Windows line breaks', ROOT_LINES.join('\r\n')],
    ['surrounded by blank lines and indentation', `\n\n  ${ROOT_LINES.join('\n  ')}\n\n`],
  ])('reads a certificate stored as %s', (_, stored) => {
    expect(databaseSsl({ DATABASE_CA_CERT: stored })).toEqual({ ca: PEM, rejectUnauthorized: true })
  })

  it('refuses loudly, naming the variable, when it holds no certificate', () => {
    expect(() => databaseSsl({ DATABASE_CA_CERT: 'prod-ca-2021.crt' })).toThrow(/DATABASE_CA_CERT/)
    const truncated = ROOT_LINES.slice(0, 8).join('\n') + '\n-----END CERTIFICATE-----'
    expect(() => databaseSsl({ DATABASE_CA_CERT: truncated })).toThrow(/not a readable certificate/)
  })
})

describe('normalizePem', () => {
  it('keeps every certificate in a bundle', () => {
    expect(normalizePem(`${PEM}\n${PEM}`)).toBe(`${PEM}\n${PEM}`)
  })

  it('finds nothing in text without a certificate', () => {
    expect(normalizePem('hello')).toBeNull()
  })
})
