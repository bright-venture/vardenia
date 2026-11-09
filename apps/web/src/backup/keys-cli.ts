import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseEnv } from 'dotenv'
import {
  ENCRYPTED_SUFFIX,
  decryptBytes,
  encryptBytes,
  generateBackupKeys,
  isEncrypted,
  readPrivateKey,
  readPublicKey,
} from './crypto'
import { isInside, localObjectPath, type Manifest, type RemoteObject } from './weekly'

/**
 * The keys of the weekly backup's encryption (see crypto.ts), and the two jobs
 * that need the private one.
 *
 *   pnpm --filter @vardenia/web backup:keys keygen --private <file>
 *   pnpm --filter @vardenia/web backup:keys encrypt-existing --key <private key file>
 *   pnpm --filter @vardenia/web backup:keys decrypt --key <private key file> --run 2026-11-09 --to <folder>
 *
 * keygen makes a new pair: the private key goes to the file named, outside the
 * repo and outside the backup folder (Vardenia keeps it in
 * Desktop\Vardenia\backup-key, decided 9 November 2026); the public
 * key goes into the env file as BACKUP_PUBLIC_KEY, which is all the weekly
 * backup needs. It refuses to replace a key that is already set, because older
 * backups open only with the private key they were made with.
 *
 * encrypt-existing locks the copies made before encryption existed. Each file
 * is locked, opened again with the private key and compared with the original
 * before the plain copy is deleted, so nothing is removed that cannot be read.
 *
 * decrypt opens one week's backup into a folder, for a restore: the tables,
 * checked against the checksums in the manifest, and every file that week's
 * listing names. The folder then holds personal data in plain, so it refuses a
 * folder inside the repository; delete it when the restore is done.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../')
const DEFAULT_OUT = path.join(ROOT, '..', 'backups', 'weekly')

const value = (argv: string[], flag: string) => {
  const at = argv.indexOf(flag)
  return at >= 0 ? argv[at + 1] : undefined
}

function envFile(argv: string[]): string {
  return path.resolve(ROOT, value(argv, '--env') ?? '.env.prod')
}

function refuseInsideRepo(target: string, what: string) {
  if (isInside(target, ROOT)) {
    throw new Error(`Refusing to write ${what} inside the repository (${target}).`)
  }
}

/** Writes aside and renames, so a cut-off write is never taken for a whole file. */
function writeWhole(target: string, bytes: Uint8Array) {
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(`${target}.part`, bytes)
  renameSync(`${target}.part`, target)
}

// ---------------------------------------------------------------------------

function keygen(argv: string[]) {
  const privatePath = value(argv, '--private')
  if (!privatePath) throw new Error('Name the file for the private key: --private <file>.')
  const target = path.resolve(privatePath)
  refuseInsideRepo(target, 'the private key')
  if (existsSync(target)) throw new Error(`${target} already exists. Choose another file.`)

  const env = envFile(argv)
  if (!existsSync(env)) throw new Error(`No env file at ${env}.`)
  const text = readFileSync(env, 'utf8')
  if (parseEnv(text).BACKUP_PUBLIC_KEY?.trim()) {
    throw new Error(
      `BACKUP_PUBLIC_KEY is already set in ${env}. Backups made with it open only with its ` +
        'private key, so it is not replaced. Remove the line by hand first if you really mean to.',
    )
  }

  const keys = generateBackupKeys()
  writeWhole(target, Buffer.from(keys.privateKeyPem))
  const line = [
    '',
    '# The weekly backup is encrypted with this public key (apps/web/src/backup/crypto.ts).',
    '# It can only lock files. The private key that opens them is a separate file, kept apart from the backups.',
    `BACKUP_PUBLIC_KEY=${keys.publicKeyLine}`,
    '',
  ].join('\n')
  writeFileSync(env, `${text.replace(/\s*$/, '')}\n${line}`)

  const fingerprint = createHash('sha256').update(keys.publicKeyLine).digest('hex').slice(0, 16)
  console.log(`Private key written to ${target}`)
  console.log(`Public key added to ${env} (fingerprint ${fingerprint})`)
  console.log('Keep the private key apart from the backups, and keep a second copy somewhere safe.')
  console.log('Without it, no backup made from now on can be opened.')
}

// ---------------------------------------------------------------------------

/** Every plain file the old backups left that holds personal data. */
function plainFiles(out: string): string[] {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (!entry.name.endsWith(ENCRYPTED_SUFFIX) && !entry.name.endsWith('.part'))
        found.push(full)
    }
  }
  // The rows of each run.
  for (const run of readdirSync(out, { withFileTypes: true })) {
    if (!run.isDirectory() || run.name === 'files' || run.name === 'logs') continue
    const database = path.join(out, run.name, 'database')
    if (!existsSync(database)) continue
    for (const file of readdirSync(database)) {
      if (file.endsWith('.jsonl')) found.push(path.join(database, file))
    }
  }
  // The shared copy of every photo, receipt and PDF.
  const files = path.join(out, 'files')
  if (existsSync(files)) walk(files)
  return found
}

function encryptExisting(argv: string[]) {
  const keyPath = value(argv, '--key')
  if (!keyPath) throw new Error('Give the private key, to check each file opens: --key <file>.')
  const privateKey = readPrivateKey(readFileSync(path.resolve(keyPath), 'utf8'))
  const env = parseEnv(readFileSync(envFile(argv)))
  if (!env.BACKUP_PUBLIC_KEY?.trim())
    throw new Error('BACKUP_PUBLIC_KEY is not set in the env file.')
  const publicKey = readPublicKey(env.BACKUP_PUBLIC_KEY)
  const out = path.resolve(value(argv, '--out') ?? DEFAULT_OUT)

  const files = plainFiles(out)
  console.log(`Encrypting ${files.length} plain files in ${out}`)
  let done = 0
  let bytes = 0
  for (const file of files) {
    const plain = readFileSync(file)
    if (isEncrypted(plain)) continue
    const locked = encryptBytes(plain, publicKey)
    // Opened again and compared before the plain copy goes.
    if (!decryptBytes(locked, privateKey).equals(plain)) {
      throw new Error(
        `${file}: the encrypted copy did not open to the same bytes. Nothing deleted.`,
      )
    }
    writeWhole(`${file}${ENCRYPTED_SUFFIX}`, locked)
    unlinkSync(file)
    done += 1
    bytes += plain.length
    if (done % 250 === 0) console.log(`  ${done} / ${files.length}`)
  }
  console.log(
    `Done: ${done} files encrypted (${(bytes / 1024 / 1024).toFixed(1)} MB), plain copies deleted.`,
  )
}

// ---------------------------------------------------------------------------

function decrypt(argv: string[]) {
  const keyPath = value(argv, '--key')
  const run = value(argv, '--run')
  const to = value(argv, '--to')
  if (!keyPath || !run || !to) {
    throw new Error('Usage: decrypt --key <private key file> --run <YYYY-MM-DD> --to <folder>')
  }
  const privateKey = readPrivateKey(readFileSync(path.resolve(keyPath), 'utf8'))
  const out = path.resolve(value(argv, '--out') ?? DEFAULT_OUT)
  const source = path.join(out, run)
  const target = path.resolve(to)
  refuseInsideRepo(target, 'opened backups, which hold personal data,')
  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new Error(`${target} is not empty. Choose an empty folder.`)
  }

  const manifest = JSON.parse(readFileSync(path.join(source, 'manifest.json'), 'utf8')) as Manifest
  writeWhole(path.join(target, 'manifest.json'), readFileSync(path.join(source, 'manifest.json')))
  const schema = path.join(source, 'database', '_schema.json')
  if (existsSync(schema))
    writeWhole(path.join(target, 'database', '_schema.json'), readFileSync(schema))

  // The tables, each checked against the checksum taken when it was read.
  for (const [table, summary] of Object.entries(manifest.tables)) {
    const locked = path.join(source, 'database', `${table}.jsonl${ENCRYPTED_SUFFIX}`)
    const plainOld = path.join(source, 'database', `${table}.jsonl`)
    const rows = existsSync(locked)
      ? decryptBytes(readFileSync(locked), privateKey)
      : readFileSync(plainOld)
    const sha256 = createHash('sha256').update(rows).digest('hex')
    if (sha256 !== summary.sha256) throw new Error(`${table}: the rows do not match the manifest.`)
    writeWhole(path.join(target, 'database', `${table}.jsonl`), rows)
  }
  console.log(`  ${Object.keys(manifest.tables).length} tables opened and checked`)

  // Every file that week's listing names, from the shared copy.
  for (const bucket of Object.keys(manifest.buckets)) {
    const listing = path.join(source, 'files', `${bucket}.json`)
    if (!existsSync(listing)) continue
    writeWhole(path.join(target, 'files', `${bucket}.json`), readFileSync(listing))
    const objects = JSON.parse(readFileSync(listing, 'utf8')) as RemoteObject[]
    let opened = 0
    let missing = 0
    for (const object of objects) {
      const from = localObjectPath(path.join(out, 'files', bucket), object.key)
      const into = localObjectPath(path.join(target, 'files', bucket), object.key)
      if (!from || !into) continue
      if (existsSync(`${from}${ENCRYPTED_SUFFIX}`)) {
        writeWhole(into, decryptBytes(readFileSync(`${from}${ENCRYPTED_SUFFIX}`), privateKey))
      } else if (existsSync(from) && statSync(from).isFile()) {
        writeWhole(into, readFileSync(from))
      } else {
        missing += 1
        continue
      }
      opened += 1
    }
    console.log(
      `  ${bucket}: ${opened} files opened${missing ? `, ${missing} not in the copy` : ''}`,
    )
  }
  console.log(
    `Opened into ${target}. It holds personal data in plain: delete it after the restore.`,
  )
}

// ---------------------------------------------------------------------------

const [command, ...argv] = process.argv.slice(2)
const commands: Record<string, (argv: string[]) => void> = {
  keygen,
  'encrypt-existing': encryptExisting,
  decrypt,
}

try {
  const run = command ? commands[command] : undefined
  if (!run)
    throw new Error('Commands: keygen, encrypt-existing, decrypt. See the top of keys-cli.ts.')
  run(argv)
  process.exit(0)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
