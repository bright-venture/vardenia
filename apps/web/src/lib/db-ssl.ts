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
  const ca = env.DATABASE_CA_CERT?.replace(/\\n/g, '\n').trim()
  if (ca) return { ca, rejectUnauthorized: true }
  return { rejectUnauthorized: false }
}
