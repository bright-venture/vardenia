import { X509Certificate } from 'node:crypto'
import type { ConnectionOptions } from 'node:tls'

/**
 * TLS for every connection to Postgres: Payload's pool, the QR redirect's
 * pool, and the backup scripts. One function so they cannot disagree again.
 *
 * # Why this exists
 *
 * Payload's pool was given a connection string and nothing else, and neither
 * DATABASE_URL carries `sslmode`. With no ssl option the pg driver does not use
 * TLS at all - verified against the development database on 13 October 2026:
 * the socket was plain text. So every query between Netlify and Supabase, the
 * database password included, crossed the internet unencrypted. The QR pool did
 * encrypt, but skipped checking who it was talking to.
 *
 * # Encrypted always, verified when the CA is configured
 *
 * Supabase signs its pooler with its own certificate authority, which Node does
 * not ship, so verification fails unless that CA is supplied. Set
 * DATABASE_CA_CERT to the PEM from the Supabase dashboard (Project Settings,
 * Database, SSL Configuration, Download certificate); `\n` escapes are accepted,
 * for hosts that store a variable on one line. With it, the certificate and the
 * host name are checked and a man in the middle is refused. Without it the
 * connection is still encrypted, but not authenticated - better than plain
 * text, and the reason the variable should be set in production.
 */
export function databaseSsl(
  env: Record<string, string | undefined> = process.env,
): ConnectionOptions {
  const raw = env.DATABASE_CA_CERT?.trim()
  if (!raw) return { rejectUnauthorized: false }

  const ca = normalizePem(raw)
  if (!ca || !readable(ca)) {
    // Loud on purpose. Node silently ignores a CA it cannot read and then
    // reports "self-signed certificate in certificate chain", which sends you
    // looking at Supabase instead of at this variable.
    throw new Error(
      'DATABASE_CA_CERT is set but is not a readable certificate. Paste the whole ' +
        'file from Supabase, from -----BEGIN CERTIFICATE----- to -----END CERTIFICATE-----, ' +
        'or remove the variable to connect without verifying.',
    )
  }
  return { ca, rejectUnauthorized: true }
}

/**
 * The certificate rebuilt as a standard PEM, whatever a host did to it.
 *
 * Hosts store variables in different shapes. Pasted into Netlify, the line
 * breaks of the Supabase file came back as something else, Node could not read
 * the result, and production deploys failed on "self-signed certificate in
 * certificate chain" while the same certificate verified perfectly locally.
 * So nothing about the layout is trusted: each certificate's base64 body is
 * taken between its markers, stripped of every space, line break and literal
 * `\n`, and rewrapped at 64 characters, which is the one layout every PEM
 * reader accepts. Null when there is no certificate in it at all.
 */
export function normalizePem(value: string): string | null {
  const text = value.replace(/\\n/g, '\n')
  const blocks = [
    ...text.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g),
  ]
  if (blocks.length === 0) return null

  return blocks
    .map(([, body]) => {
      const base64 = (body ?? '').replace(/[^A-Za-z0-9+/=]/g, '')
      const lines = base64.match(/.{1,64}/g) ?? []
      return ['-----BEGIN CERTIFICATE-----', ...lines, '-----END CERTIFICATE-----'].join('\n')
    })
    .join('\n')
}

/** Whether every certificate in the PEM parses. */
function readable(pem: string): boolean {
  try {
    const each = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? []
    each.forEach((block) => new X509Certificate(block))
    return each.length > 0
  } catch {
    return false
  }
}
