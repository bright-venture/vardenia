'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { signupSchema } from '@vardenia/core'

/**
 * How strong the password somebody is typing actually is.
 *
 * # Shown and enforced are two different lists, on purpose
 *
 * The checklist includes the familiar composition boxes - a number, a symbol,
 * upper and lower case - because they were asked for. The server does not check
 * any of them, and packages/core/booking-request explains why it refuses to:
 * composition rules push people towards `Password1!`, which ticks all three and
 * is worthless.
 *
 * Both facts can be true at once, and the shape of this component is what keeps
 * them from contradicting each other:
 *
 *   - Exactly one rule is `required`, and it is the server's own length rule.
 *     It is marked as such on screen. Nothing else can stop a submission.
 *   - `notCommon` sits beside the composition boxes precisely so they cannot be
 *     gamed. `Password1!` ticks three and is still flagged, and still cannot
 *     reach the top band.
 *   - The meter is advice throughout. It never blocks: a meter that refuses a
 *     password the server would accept is one people work around rather than
 *     learn from, and it would also be lying about what happens next.
 *
 * The earlier version of this file argued the composition boxes should not exist
 * at all. That argument is recorded in packages/core, where the rule that
 * actually matters lives; this is the display layer, and it shows what it was
 * asked to show without pretending the server agrees.
 *
 * # The requirement is the server's own schema, not a copy of it
 *
 * `signupSchema.shape.password` is the zod rule `/auth/signup` validates
 * against. Asking it directly means the tick cannot come to a different
 * conclusion than the endpoint - a form that says a password is fine and is then
 * refused is worse than one that never reassured anybody.
 *
 * # Guessability still matters, and it is the one thing length cannot fix
 *
 * `password1234` is twelve characters and worthless. The patterns below are the
 * cheap, honest subset: known common passwords, a character repeated, and a run
 * along the keyboard or the alphabet. Anything matching is pinned to the lowest
 * band however long it is.
 *
 * This is a hint, not a gate. It never blocks submission - the server decides
 * that - because a meter that refuses a password it merely dislikes is a meter
 * people work around rather than learn from.
 */

/** Known-bad openings. Short list on purpose: it is a nudge, not a breach check. */
const COMMON =
  /^(?:password|passw0rd|qwerty|letmein|welcome|admin|iloveyou|monkey|dragon|abc123|111111|123123|123456)/i
/** The same character four times or more. */
const REPEATED = /(.)\1{3,}/
/** A run along the keyboard or the alphabet. */
const SEQUENCE = /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|wert|erty|asdf)/i

/**
 * ASCII punctuation, by range rather than by listing characters.
 *
 * Deliberately excludes the space. A space is not alphanumeric and would satisfy
 * a naive `[^A-Za-z0-9]`, so "olive trees" would have counted as containing a
 * special character - which is not what anybody means by one.
 */
const SYMBOL = /[!-/:-@[-`{-~]/

/**
 * What the reader is told about, in the order it is worth knowing.
 *
 *   length       the server's own floor, and the only required one
 *   number       a digit
 *   symbol       ASCII punctuation, not merely a space
 *   case         upper and lower together
 *   notCommon    length cannot save `password1234`
 *   notPersonal  the one an attacker who knows the reader tries first
 *
 * # The composition rules here are advice, and only advice
 *
 * `number`, `symbol` and `case` were asked for. They are worth being plain
 * about, because packages/core deliberately refuses to enforce them:
 * composition requirements push people towards `Password1!`, which satisfies all
 * three and is worthless. So they are shown, they move the meter, and none of
 * them can stop a form being submitted - `required` is true on `length` alone,
 * which is the only rule /auth/signup actually checks.
 *
 * That split is the point. A reader who wants the familiar boxes gets them; a
 * reader who types four ordinary words is not blocked for owning no keyboard
 * symbols. `notCommon` is what stops the boxes being gamed: `Password1!` ticks
 * three of them and is still flagged.
 *
 * The rule that used to sit here - "two words or more" - was removed on request.
 *
 * # `notPersonal` is why this takes a context
 *
 * Somebody who targets a specific person starts with their name, their email and
 * the service they are signing into - which is exactly what a sign-up form has
 * on screen and has never checked. Current guidance names this explicitly, and
 * it is the only rule here that no amount of length fixes.
 *
 * It is dropped rather than auto-passed where there is nothing to compare
 * against: the reset form is reached from a link and knows neither name nor
 * email, and a tick beside "not your name" on a page that never saw your name
 * is a claim the page cannot make.
 */
export interface PasswordContext {
  name?: string
  email?: string
}

export interface PasswordRule {
  id: string
  /** Whether the server refuses the password without it. Exactly one is true. */
  required: boolean
  test: (value: string, context: PasswordContext) => boolean
  /** False when there is nothing to check the rule against; it is then hidden. */
  applies?: (context: PasswordContext) => boolean
}

/**
 * Anything from the reader's own details that is worth refusing.
 *
 * The email's local part as well as the whole address, because `dav@x.com` gives
 * `dav` - and three characters is the floor, below which this would refuse
 * ordinary words for containing somebody's initials.
 */
function personalTerms({ name, email }: PasswordContext): string[] {
  const terms = [name, email, email?.split('@')[0]]
    .flatMap((value) => (value ?? '').split(/[\s.@_-]+/))
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 3)

  return [...new Set(terms)]
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    required: true,
    // The server's schema, asked directly - see the note at the top of the file.
    test: (value) => signupSchema.shape.password.safeParse(value).success,
  },
  { id: 'number', required: false, test: (value) => /\d/.test(value) },
  { id: 'symbol', required: false, test: (value) => SYMBOL.test(value) },
  {
    id: 'case',
    required: false,
    test: (value) => /[a-z]/.test(value) && /[A-Z]/.test(value),
  },
  {
    id: 'notCommon',
    required: false,
    test: (value) => !(COMMON.test(value) || REPEATED.test(value) || SEQUENCE.test(value)),
  },
  {
    id: 'notPersonal',
    required: false,
    applies: (context) => personalTerms(context).length > 0,
    test: (value, context) => {
      const lowered = value.toLowerCase()
      return !personalTerms(context).some((term) => lowered.includes(term))
    },
  },
]

export interface EvaluatedRule {
  id: string
  met: boolean
  required: boolean
}

export interface PasswordStrengthState {
  /** How many rules are met. 0 when nothing has been typed. */
  score: number
  /** How many rules apply, which is what the bars count. */
  max: number
  /** Whether the password clears the rule the server enforces. */
  meetsRequirement: boolean
  /** A common password, a repeat, or a keyboard run. Shown as its own warning. */
  guessable: boolean
  rules: EvaluatedRule[]
}

export function evaluatePassword(value: string, context: PasswordContext = {}) {
  const applicable = PASSWORD_RULES.filter((rule) => rule.applies?.(context) ?? true)
  const max = applicable.length

  if (value.length === 0) {
    return {
      score: 0,
      max,
      meetsRequirement: false,
      guessable: false,
      rules: applicable.map((rule) => ({ id: rule.id, met: false, required: rule.required })),
    } satisfies PasswordStrengthState
  }

  const rules = applicable.map((rule) => ({
    id: rule.id,
    met: rule.test(value, context),
    required: rule.required,
  }))

  return {
    score: rules.filter((rule) => rule.met).length,
    max,
    meetsRequirement: rules.find((rule) => rule.id === 'length')?.met ?? false,
    guessable: !(rules.find((rule) => rule.id === 'notCommon')?.met ?? true),
    rules,
  } satisfies PasswordStrengthState
}

/**
 * The word for a score, by proportion rather than by count.
 *
 * A count would mean different things on the two forms: five out of five on the
 * reset page is everything, and five out of six on sign-up is not.
 *
 * # A guessable password is Weak however many boxes it ticks
 *
 * This clamp is what makes the composition rules safe to show. Without it
 * `Password1!` scores five of six - length, a number, a symbol, mixed case, not
 * the reader's name - and the meter calls it **Good**. It is the single most
 * guessed password shape there is.
 *
 * Found by typing it into the running page, not by reading the code: the
 * arithmetic looked fine and the word on screen was wrong. Composition boxes are
 * gameable by construction, so the pattern check has to outrank them rather than
 * merely sit beside them.
 */
export function strengthBand(score: number, max: number, guessable = false): 0 | 1 | 2 | 3 | 4 {
  if (score === 0 || max === 0) return 0
  if (guessable) return 1

  const ratio = score / max
  if (ratio >= 1) return 4
  if (ratio >= 0.75) return 3
  if (ratio >= 0.5) return 2
  return 1
}

/**
 * The four bands, coloured.
 *
 * `state.*` rather than the brand palette, for the reason ui/Tier gives about
 * verified: these are statuses. A password being weak is not a brand moment, and
 * gold on the "nearly there" step would read as praise.
 *
 * Every one of these is checked against every ground the site has - see
 * lib/contrast.test.ts, which exists because three of them shipped failing.
 */
const TONES = [
  'bg-ink-100',
  'bg-state-danger',
  'bg-state-warning',
  'bg-state-info',
  'bg-state-success',
] as const

const TEXT_TONES = [
  'text-ink-500',
  'text-state-danger',
  'text-state-warning',
  'text-state-info',
  'text-state-success',
] as const

/**
 * How long to wait before telling a screen reader.
 *
 * Announcing on every keystroke turns a password field into a stream of
 * interruptions - "weak, weak, fair, weak" - which is worse than silence. This
 * waits for a pause in typing and then says one sentence.
 */
const ANNOUNCE_DELAY = 700

export function PasswordStrength({
  value,
  name,
  email,
  className = '',
}: {
  value: string
  /** The reader's own details, so a password made of them can be refused. */
  name?: string
  email?: string
  className?: string
}) {
  const t = useTranslations('account')

  /**
   * The context is rebuilt on every keystroke of the name and email fields too,
   * so it is memoised on its parts rather than on the object - an object literal
   * is a new reference every render and would defeat the memo entirely.
   */
  const state = useMemo(() => evaluatePassword(value, { name, email }), [value, name, email])
  const { score, max, meetsRequirement, guessable, rules } = state
  const band = strengthBand(score, max, guessable)

  const labels = [
    t('strengthEmpty'),
    t('strengthWeak'),
    t('strengthFair'),
    t('strengthGood'),
    t('strengthStrong'),
  ]

  const unmet = rules.filter((rule) => !rule.met)

  const sentence =
    value.length === 0
      ? ''
      : [
          t('strengthAnnounce', { label: labels[band] ?? '' }),
          guessable ? t('strengthGuessable') : '',
          unmet.length === 0
            ? t('strengthAllMet')
            : t('strengthStillNeeded', {
                list: unmet.map((rule) => t(`rule_${rule.id}` as never)).join(', '),
              }),
        ]
          .filter(Boolean)
          .join(' ')

  const [announced, setAnnounced] = useState('')

  /**
   * One timer for both cases, and the state is set inside it rather than in the
   * effect body.
   *
   * Clearing synchronously on an empty field looks tidier and is what the first
   * version did; `react-hooks/set-state-in-effect` refuses it, and rightly - a
   * setState in an effect body is a second render pass on every change. Going
   * through the timer at zero delay costs a tick and removes the extra pass.
   */
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(sentence), sentence === '' ? 0 : ANNOUNCE_DELAY)
    return () => clearTimeout(timer)
  }, [sentence])

  return (
    <div className={className}>
      {/*
        A meter, so it is announced as one rather than as four empty divs.
        `aria-valuetext` carries the word, because "3 out of 4" is not what a
        listener needs to hear about a password.
      */}
      <div
        role="meter"
        aria-label={t('strengthLabel')}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={score}
        aria-valuetext={labels[band] ?? ''}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${max}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: max }, (_, i) => (
          <div key={i} className="bg-ink-100 relative h-1 overflow-hidden">
            {/*
              A scale transform rather than a width, so the browser animates it
              on the compositor instead of laying the row out again on every
              keystroke.

              `ltr:origin-left rtl:origin-right`, because a bar that fills from
              the left in Arabic grows away from the direction the reader is
              reading. The global reduced-motion rule cancels the duration, so
              there is nothing to switch off here.
            */}
            <span
              className={`absolute inset-0 ltr:origin-left rtl:origin-right ${
                i < score ? 'scale-x-100' : 'scale-x-0'
              } ${TONES[band] ?? TONES[0]} transition-transform duration-300`}
              style={{ transitionDelay: i < score ? `${i * 40}ms` : '0ms' }}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex h-5 items-center justify-between gap-3">
        {/*
          Every label is rendered and all but one is transparent, stacked in one
          grid cell. Swapping the text instead would change the width of the row
          as the word changes, nudging everything beside it. `aria-hidden`
          because the meter above already carries the value.
        */}
        <span className="inline-grid text-xs font-medium leading-5">
          {labels.map((label, i) => (
            <span
              key={label}
              aria-hidden
              className={`col-start-1 row-start-1 whitespace-nowrap transition-opacity duration-200 ${
                TEXT_TONES[band] ?? TEXT_TONES[0]
              } ${i === band ? 'opacity-100' : 'opacity-0'}`}
            >
              {label}
            </span>
          ))}
        </span>

        <span
          aria-hidden
          className={`text-state-warning whitespace-nowrap text-[11px] leading-5 transition-opacity duration-200 ${
            guessable ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {t('strengthGuessable')}
        </span>
      </div>

      {/*
        The checklist.

        A real list, so a screen reader says how many there are before reading
        them. Colour is never the only signal: each row carries a tick, a change
        of text colour, and an off-screen word saying met or not - a green box
        alone tells a colour-blind reader nothing.

        The required row is marked, because "at least 10 characters" and "two
        words or more" look identical otherwise and only one of them will stop
        the form being accepted.
      */}
      <ul className="mt-3 grid gap-1.5">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className={`grid size-3.5 shrink-0 place-items-center border transition-colors duration-200 ${
                rule.met
                  ? 'border-state-success bg-state-success text-surface-base'
                  : 'border-ink-100'
              }`}
            >
              <svg viewBox="0 0 12 12" fill="none" className="size-2.5">
                <path
                  d="M2 6.2 4.7 8.9 10 3.3"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-opacity duration-200 ${
                    rule.met ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </svg>
            </span>

            <span className={rule.met ? 'text-ink-700' : 'text-ink-500'}>
              {t(`rule_${rule.id}` as never)}
            </span>

            {rule.required ? (
              <span className="text-ink-500 font-mono text-[10px] uppercase tracking-[0.14em]">
                {t('strengthRequired')}
              </span>
            ) : null}

            {/* The spaces are not decoration. Without them the off-screen words
                butt against the visible label, and copying the list out of the
                page gives "At least 10 charactersRequiredmet". */}
            <span className="sr-only"> {rule.met ? t('strengthMet') : t('strengthNotMet')}</span>
          </li>
        ))}
      </ul>

      {/* The one line of advice that is not a box to tick. */}
      <p className="text-ink-500 mt-2.5 text-[11px] leading-relaxed">{t('strengthAdvice')}</p>

      {/* Said once, after a pause. See ANNOUNCE_DELAY. */}
      <p aria-live="polite" className="sr-only">
        {announced}
      </p>
    </div>
  )
}
