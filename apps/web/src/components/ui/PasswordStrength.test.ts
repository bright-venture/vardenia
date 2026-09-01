import { describe, expect, it } from 'vitest'
import { signupSchema } from '@vardenia/core'
import { evaluatePassword } from './PasswordStrength'

/**
 * The meter, and the one property that actually matters: that it never
 * disagrees with the server.
 *
 * A strength meter is decoration until it contradicts the endpoint. Then it is a
 * form that ticks a green box and is refused on submit, which is worse than
 * having no meter at all - the reader has been told they are done.
 */
describe('agreeing with the server', () => {
  const cases = [
    '',
    'short',
    'nine char',
    '0123456789',
    'correct horse battery staple',
    '          ',
    '          x',
    'a'.repeat(201),
  ]

  it.each(cases)('matches signupSchema for %j', (password) => {
    expect(evaluatePassword(password).meetsRequirement).toBe(
      signupSchema.shape.password.safeParse(password).success,
    )
  })

  /**
   * The case that motivated reading the schema instead of writing `length >= 10`:
   * ten spaces is ten characters and no password, and the schema already refuses
   * it. A hand-rolled length check in the component would have ticked the box.
   */
  it('refuses whitespace that is long enough to look valid', () => {
    expect(evaluatePassword('          ').meetsRequirement).toBe(false)
  })
})

describe('scoring', () => {
  it('is zero only when nothing has been typed', () => {
    expect(evaluatePassword('').score).toBe(0)
    expect(evaluatePassword('a').score).toBeGreaterThan(0)
  })

  it('rises with length', () => {
    const scores = ['a', 'a'.repeat(10), 'a'.repeat(14), 'a'.repeat(20), 'a'.repeat(26)].map(
      (v) => evaluatePassword(v).score,
    )
    // Not strictly increasing: repeats are guessable, which is the next test.
    expect(scores[0]).toBeLessThanOrEqual(scores[4]!)
  })

  it('rises with length, on a password that is not a repeat', () => {
    const build = (n: number) => 'Th3 quick brown fox jumps over it'.slice(0, n)
    expect(evaluatePassword(build(9)).score).toBeLessThan(evaluatePassword(build(14)).score)
    expect(evaluatePassword(build(14)).score).toBeLessThan(evaluatePassword(build(26)).score)
  })

  it('never exceeds the number of bars drawn', () => {
    const { score, max } = evaluatePassword('a'.repeat(200))
    expect(score).toBeLessThanOrEqual(max)
  })
})

/**
 * Length alone is not strength, and this is the half the length bands cannot
 * see. Each of these is long enough to clear the requirement and worthless.
 */
describe('guessable patterns', () => {
  it.each([
    ['a common password', 'password12345'],
    ['a repeated character', 'aaaaaaaaaaaaaa'],
    ['a run of digits', 'my pin is 123456'],
    ['a run along the keyboard', 'qwertyuiop asdf'],
  ])('pins %s to the lowest band', (_name, password) => {
    const result = evaluatePassword(password)
    expect(result.guessable).toBe(true)
    expect(result.score).toBe(1)
  })

  it('leaves an ordinary passphrase alone', () => {
    const result = evaluatePassword('olive trees above the harbour')
    expect(result.guessable).toBe(false)
    expect(result.score).toBeGreaterThan(1)
  })

  /**
   * Guessability is advice, not a gate. The server decides what is acceptable,
   * and a long guessable password still clears its rule - the meter says so
   * quietly rather than refusing.
   */
  it('does not withhold the requirement from a guessable password', () => {
    expect(evaluatePassword('password12345').meetsRequirement).toBe(true)
  })
})
