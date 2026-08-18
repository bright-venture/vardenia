import { describe, expect, it } from 'vitest'
import { indexingWarning, isIndexingAllowed } from './indexing'

/**
 * The switch that keeps Google away until the directory has content.
 *
 * Both directions are dangerous in different ways, so both are tested. Wrongly
 * on means the domain's first crawl lands on an empty page. Wrongly off means
 * the site is invisible to search indefinitely, with nothing broken to notice -
 * which is why the warning copy is tested as carefully as the flag.
 */

describe('isIndexingAllowed', () => {
  it('allows indexing only for the exact string true', () => {
    expect(isIndexingAllowed('true')).toBe(true)
  })

  it('tolerates the casing and whitespace a dashboard field introduces', () => {
    // Pasted into a hosting UI, trailing spaces and capitals are routine.
    expect(isIndexingAllowed('TRUE')).toBe(true)
    expect(isIndexingAllowed('True')).toBe(true)
    expect(isIndexingAllowed('  true  ')).toBe(true)
  })

  /**
   * Fails closed. Unset is the state this ships in, and it must mean "not yet"
   * rather than "sure, go ahead".
   */
  it('refuses when unset or empty', () => {
    expect(isIndexingAllowed(undefined)).toBe(false)
    expect(isIndexingAllowed('')).toBe(false)
    expect(isIndexingAllowed('   ')).toBe(false)
  })

  /**
   * Anything ambiguous means the person setting it was guessing at the format.
   * The safe reading of a guess is "not yet" - a site wrongly left out of Google
   * is recoverable, an empty directory indexed as the brand's first impression
   * is harder to undo.
   */
  it('refuses anything that merely looks affirmative', () => {
    for (const value of ['1', 'yes', 'y', 'on', 'enabled', 'TRUE!', 'true-ish'])
      expect(isIndexingAllowed(value)).toBe(false)
  })

  it('refuses explicit negatives', () => {
    for (const value of ['false', 'FALSE', '0', 'no', 'off'])
      expect(isIndexingAllowed(value)).toBe(false)
  })
})

describe('indexingWarning', () => {
  it('says nothing once indexing is on', () => {
    expect(indexingWarning('true')).toBeNull()
  })

  /**
   * This is the mitigation for failing closed. The dashboard is the only place
   * anyone would notice, so the text has to name the variable and the action -
   * "SEO is off" would send someone hunting through the codebase.
   */
  it('names the variable and what to do when indexing is off', () => {
    const warning = indexingWarning(undefined)
    expect(warning).not.toBeNull()
    expect(warning).toContain('NEXT_PUBLIC_ALLOW_INDEX')
    expect(warning).toMatch(/redeploy/i)
  })

  it('warns for every value that is not an enabling one', () => {
    for (const value of [undefined, '', 'false', '1', 'yes'])
      expect(indexingWarning(value)).not.toBeNull()
  })
})
