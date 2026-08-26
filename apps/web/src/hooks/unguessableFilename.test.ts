import { describe, expect, it } from 'vitest'
import { slugifyStem, unguessableName } from './unguessableFilename'

/**
 * Renaming an upload so its address cannot be worked out.
 *
 * The bucket is public by intent, so the name is the only thing between a file
 * and anyone who can type. These check the two properties that matter: the
 * suffix carries real entropy, and nothing about the original name can be used
 * to reconstruct it.
 */

const fixed = (hex: string) => () => Buffer.from(hex, 'hex')

describe('unguessableName', () => {
  it('keeps a readable stem and appends randomness', () => {
    expect(unguessableName('Beirut Sunset.webp', fixed('a3f19c4e2b7d5081aabbccdd'))).toBe(
      'beirut-sunset-a3f19c4e2b7d5081aabbccdd.webp',
    )
  })

  it('keeps the extension, because sharp and the content type both need it', () => {
    for (const ext of ['jpg', 'png', 'webp', 'avif', 'mp4', 'pdf']) {
      expect(unguessableName(`photo.${ext}`)).toMatch(new RegExp(`\\.${ext}$`))
    }
  })

  it('gives a different name to the same file every time', () => {
    const names = new Set(Array.from({ length: 50 }, () => unguessableName('photo.webp')))
    expect(names.size).toBe(50)
  })

  /**
   * The property the whole hook exists for. Knowing the original name must not
   * narrow the search, so two uploads of the same file share only the stem.
   */
  it('carries at least 96 bits in the suffix', () => {
    const name = unguessableName('photo.webp')
    const suffix = /-([0-9a-f]+)\.webp$/.exec(name)?.[1]
    expect(suffix).toBeDefined()
    expect(suffix!.length, 'fewer hex characters than 96 bits').toBeGreaterThanOrEqual(24)
  })

  it('survives a name that slugifies to nothing', () => {
    const name = unguessableName('....webp')
    expect(name).toMatch(/^[0-9a-f]{24}\.webp$/)
  })

  it('handles a file with no extension at all', () => {
    expect(unguessableName('README', fixed('aabbccddeeff001122334455'))).toBe(
      'readme-aabbccddeeff001122334455',
    )
  })

  /**
   * A double extension is how an upload smuggles a second type past a check that
   * only reads the last one. Only one survives here.
   */
  it('leaves a crafted double extension with one extension', () => {
    const name = unguessableName('shell.php.jpg')
    expect(name).toMatch(/\.jpg$/)
    expect(name).not.toContain('.php')
  })

  it('strips anything that is not a letter or digit from the extension', () => {
    expect(unguessableName('x.we bp')).toMatch(/\.webp$/)
  })

  it('does not let a long name grow without bound', () => {
    const name = unguessableName(`${'a'.repeat(400)}.webp`)
    expect(name.length).toBeLessThan(100)
  })

  /**
   * A traversal attempt must not survive into a path segment. Payload sanitises
   * too, but a filename is written to a bucket key and this is cheap.
   */
  it('cannot produce a path separator or a traversal', () => {
    for (const nasty of ['../../etc/passwd.jpg', 'a\\b.png', 'a/b.png', '..%2f..%2fx.webp']) {
      const name = unguessableName(nasty)
      expect(name, nasty).not.toMatch(/[/\\]/)
      expect(name, nasty).not.toContain('..')
    }
  })
})

describe('slugifyStem', () => {
  it('folds accents rather than dropping the word', () => {
    expect(slugifyStem('Café Résumé')).toBe('cafe-resume')
  })

  it('collapses runs and trims the edges', () => {
    expect(slugifyStem('  --A   B--  ')).toBe('a-b')
  })

  it('returns empty when nothing usable is left', () => {
    expect(slugifyStem('...')).toBe('')
    expect(slugifyStem('   ')).toBe('')
  })

  it('never ends in a dash, which would double up with the suffix', () => {
    expect(slugifyStem('a'.repeat(59) + '-b')).not.toMatch(/-$/)
  })
})
