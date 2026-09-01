/**
 * Refuse to start a second development server.
 *
 * # The failure this prevents
 *
 * `next dev` does not stop when its port is taken. It prints a warning, picks
 * the next free port and carries on:
 *
 *     Port 3000 is in use by process 4692, using available port 3001 instead.
 *
 * Which would be helpful if each server had its own output directory. They do
 * not: next.config sets `distDir` to `.next-dev` for every development build, so
 * the second server compiles into the same folder as the first. Two compilers
 * writing one set of manifests produces corruption that does not look like
 * corruption - the symptom is
 *
 *     not-found.tsx doesn't have a root layout
 *
 * on pages that have a perfectly good layout, 500s on chunk requests, and pages
 * that render but never hydrate, so forms appear on screen and do nothing. It
 * cost an hour to work out, and clearing `.next-dev` is the only cure.
 *
 * The warning scrolls past in a wall of build output. Refusing to start does
 * not.
 *
 * # Why a port check rather than a lock file
 *
 * A lock file has to be cleaned up, and a development server killed with
 * Ctrl+C - or with `Stop-Process -Force`, which is how this happened - does not
 * clean anything up. A stale lock would then refuse a server that should start,
 * which is a worse failure than the one being prevented. The port is the real
 * resource and the operating system tracks it for us.
 */
import net from 'node:net'

/** `-p 3001`, `--port=3001`, `PORT=3001`, or Next's own default. */
function wantedPort() {
  const args = process.argv.slice(2)

  const flag = args.findIndex((arg) => arg === '-p' || arg === '--port')
  if (flag !== -1 && args[flag + 1]) return Number(args[flag + 1])

  const inline = args.find((arg) => arg.startsWith('--port='))
  if (inline) return Number(inline.split('=')[1])

  return Number(process.env.PORT) || 3000
}

const port = wantedPort()

/**
 * Binding is the only honest test. Anything that reads a list of sockets can be
 * out of date by the time the server starts, and a bind either succeeds or does
 * not for exactly the reason we care about.
 */
const probe = net.createServer()

probe.once('error', (error) => {
  if (error.code !== 'EADDRINUSE') {
    // Something else is wrong with the machine. Not this script's business, and
    // not a reason to block a developer from starting a server.
    process.exit(0)
  }

  console.error(
    [
      '',
      `  Port ${port} is already in use, so a development server is probably already running.`,
      '',
      '  Not starting a second one. Both would compile into apps/web/.next-dev and',
      '  corrupt each other, which shows up as "not-found.tsx doesn\'t have a root',
      '  layout", 500s on chunks, and pages that render but never hydrate.',
      '',
      '  Use the server you have, or stop it and try again. If you believe nothing',
      `  is running, something else holds ${port}:`,
      '',
      process.platform === 'win32'
        ? `    Get-NetTCPConnection -LocalPort ${port} -State Listen`
        : `    lsof -i :${port}`,
      '',
      '  If the last run was killed hard, clear the shared output first:',
      '',
      '    rm -rf apps/web/.next-dev',
      '',
    ].join('\n'),
  )

  process.exit(1)
})

probe.once('listening', () => probe.close(() => process.exit(0)))

/**
 * No host argument, deliberately.
 *
 * The first version passed `'0.0.0.0'` and reported the port free while a
 * development server was plainly running on it. Windows had it on `:::3000` -
 * the IPv6 wildcard, dual-stack - and an IPv4-only bind does not collide with
 * that, so the check passed and the guard never fired.
 *
 * Omitting the host makes Node bind the unspecified address the same way Next
 * does, which is the only version of this test that answers the question being
 * asked.
 */
probe.listen(port)
