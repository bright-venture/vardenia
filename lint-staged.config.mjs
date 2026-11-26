import path from 'node:path'

/**
 * The pre-commit hook (.husky/pre-commit): Prettier on the staged files.
 *
 * In batches, because one command with every file in it fails on Windows once
 * a commit holds about 90 files ("The command line is too long"). Paths are
 * relative with forward slashes to keep each command short.
 */
const BATCH = 30

const relative = (file) => path.relative(process.cwd(), file).split(path.sep).join('/')

export default {
  '*.{ts,tsx,js,jsx,json,md,mjs}': (files) => {
    const commands = []
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH).map((file) => `"${relative(file)}"`)
      commands.push(`prettier --write ${batch.join(' ')}`)
    }
    return commands
  },
}
