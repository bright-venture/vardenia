import { describe, expect, it } from 'vitest'
import { signupSchema } from '@vardenia/core'
import { PASSWORD_RULES, evaluatePassword, strengthBand } from './PasswordStrength'

const met = (value: string, id: string, context = {}) =>
  evaluatePassword(value, context).rules.find((rule) => rule.id === id)?.met

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

  it('has exactly one required rule, so the marked one is the server`s', () => {
    expect(PASSWORD_RULES.filter((rule) => rule.required)).toHaveLength(1)
    expect(PASSWORD_RULES.find((rule) => rule.required)?.id).toBe('length')
  })
})

describe('the rules', () => {
  it('scores nothing for an empty field, and lists every rule as unmet', () => {
    const state = evaluatePassword('')
    expect(state.score).toBe(0)
    expect(state.rules.every((rule) => !rule.met)).toBe(true)
  })

  describe('a number', () => {
    it('wants a digit', () => {
      expect(met('olive trees', 'number')).toBe(false)
      expect(met('olive trees 7', 'number')).toBe(true)
    })
  })

  describe('a special character', () => {
    it('wants punctuation', () => {
      expect(met('olive trees', 'symbol')).toBe(false)
      expect(met('olive-trees', 'symbol')).toBe(true)
    })

    /**
     * A space is not alphanumeric, so a naive `[^A-Za-z0-9]` would have counted
     * "olive trees" as containing a special character. Nobody means that.
     */
    it('does not count a space as one', () => {
      expect(met('olive trees above the harbour', 'symbol')).toBe(false)
    })
  })

  describe('upper and lower case', () => {
    it('wants both, not either', () => {
      expect(met('olive trees', 'case')).toBe(false)
      expect(met('OLIVE TREES', 'case')).toBe(false)
      expect(met('Olive trees', 'case')).toBe(true)
    })
  })

  /**
   * The composition rules are advice. `Password1!` satisfies a number, a symbol
   * and mixed case - the whole familiar checklist - and is worthless, which is
   * why `notCommon` sits beside them and why none of them is `required`.
   */
  describe('Password1!, the reason composition rules are not enforced', () => {
    const state = () => evaluatePassword('Password1!')

    it('ticks every composition box', () => {
      expect(met('Password1!', 'number')).toBe(true)
      expect(met('Password1!', 'symbol')).toBe(true)
      expect(met('Password1!', 'case')).toBe(true)
    })

    it('is still flagged as an obvious pattern', () => {
      expect(state().guessable).toBe(true)
      expect(met('Password1!', 'notCommon')).toBe(false)
    })

    /**
     * The clamp, and the case that put it there. Without it this scores five of
     * six and the meter says "Good" - checked in the running page, where the
     * arithmetic was right and the word was wrong.
     */
    it('reads Weak however many boxes it ticks', () => {
      const { score, max, guessable } = state()
      expect(score).toBeGreaterThanOrEqual(max - 1)
      expect(strengthBand(score, max, guessable)).toBe(1)
    })

    it('would have read Good without the clamp, which is why it exists', () => {
      const { score, max } = state()
      expect(strengthBand(score, max, false)).toBe(3)
    })
  })

  /**
   * The other half of the same point: a password with no symbols and no digits
   * is allowed through, because the server asks for length and nothing else.
   */
  it('lets an ordinary passphrase through even though it ticks few boxes', () => {
    const state = evaluatePassword('olive trees above the harbour')
    expect(state.meetsRequirement).toBe(true)
    expect(met('olive trees above the harbour', 'symbol')).toBe(false)
    expect(met('olive trees above the harbour', 'number')).toBe(false)
  })

  describe('not an obvious pattern', () => {
    it.each([
      ['a common password', 'password12345'],
      ['a repeated character', 'aaaaaaaaaaaaaa'],
      ['a run of digits', 'my pin is 123456'],
      ['a run along the keyboard', 'qwertyuiop asdf'],
    ])('catches %s', (_name, password) => {
      expect(met(password, 'notCommon')).toBe(false)
      expect(evaluatePassword(password).guessable).toBe(true)
    })

    it('leaves an ordinary passphrase alone', () => {
      expect(met('olive trees above the harbour', 'notCommon')).toBe(true)
    })
  })
})

/**
 * The rule an attacker who knows the reader tries first, and the only one here
 * that no amount of length fixes.
 */
describe('not your name or email', () => {
  const context = { name: 'David Bright', email: 'dav.chem11@example.com' }

  it.each([
    ['the given name', 'david and the sea wall'],
    ['the family name', 'a very bright morning indeed'],
    ['the email local part', 'chem11 is my favourite'],
    ['a different case', 'DAVID walks the long road'],
  ])('refuses a password containing %s', (_name, password) => {
    expect(met(password, 'notPersonal', context)).toBe(false)
  })

  it('accepts a password that shares nothing with them', () => {
    expect(met('olive trees above the harbour', 'notPersonal', context)).toBe(true)
  })

  /**
   * Two-character fragments would refuse ordinary words for containing somebody's
   * initials - `a.b@x.com` would ban every password with an "a" in it.
   */
  it('ignores fragments too short to mean anything', () => {
    expect(met('olive trees above the harbour', 'notPersonal', { email: 'a.b@x.com' })).toBe(true)
  })

  /**
   * The reset form is reached from a link and knows neither name nor email. A
   * tick beside "not your name" on a page that never saw your name is a claim
   * the page cannot make, so the rule is dropped rather than auto-passed.
   */
  it('is not shown at all when there is nothing to compare against', () => {
    const withContext = evaluatePassword('olive trees', context)
    const without = evaluatePassword('olive trees')

    expect(withContext.rules.map((r) => r.id)).toContain('notPersonal')
    expect(without.rules.map((r) => r.id)).not.toContain('notPersonal')
    expect(without.max).toBe(withContext.max - 1)
  })
})

/**
 * The word is a proportion, not a count, because four of four on the reset form
 * is everything and four of five on sign-up is not.
 */
describe('the strength word', () => {
  it('says nothing for an empty field', () => {
    expect(strengthBand(0, 5)).toBe(0)
  })

  it('reaches the top only when every rule is met', () => {
    expect(strengthBand(4, 5)).toBeLessThan(4)
    expect(strengthBand(5, 5)).toBe(4)
    expect(strengthBand(4, 4)).toBe(4)
  })

  it('rises with the proportion met', () => {
    expect(strengthBand(1, 5)).toBeLessThan(strengthBand(3, 5))
    expect(strengthBand(3, 5)).toBeLessThan(strengthBand(5, 5))
  })

  it('never divides by zero', () => {
    expect(() => strengthBand(0, 0)).not.toThrow()
    expect(strengthBand(0, 0)).toBe(0)
  })

  it('holds a guessable password at Weak no matter the proportion', () => {
    expect(strengthBand(6, 6, true)).toBe(1)
    expect(strengthBand(5, 6, true)).toBe(1)
  })

  it('still says nothing for an empty field, even if flagged guessable', () => {
    expect(strengthBand(0, 6, true)).toBe(0)
  })
})
