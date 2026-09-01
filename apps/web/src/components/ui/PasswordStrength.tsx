'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { signupSchema } from '@vardenia/core'

/**
 * How strong the password somebody is typing actually is.
 *
 * # The composition checklist is deliberately not here
 *
 * The component this is adapted from scores a password on four boxes: twelve
 * characters, upper and lower case, a digit, a symbol. Vardenia's password rule
 * refuses exactly that, and says why in packages/core/booking-request:
 * composition rules push people towards `Password1!` and are weaker in practice
 * than a long passphrase, which is why current guidance dropped them.
 *
 * Shipping the original would have put a checklist on screen demanding a symbol,
 * directly under a hint that says length beats punctuation, in front of a server
 * that only checks length. Three answers to one question, two of them wrong.
 *
 * So the bars measure length, and the one requirement shown is the real one.
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
 * Length bands, in characters.
 *
 * The first is the server's floor, so the first filled bar and the ticked
 * requirement always agree. The rest are advice: each step is roughly an order
 * of magnitude more work to guess, and 20 is where a passphrase of three or four
 * words lands without anybody being told to count.
 */
const BANDS = [10, 14, 20, 26] as const

export interface PasswordStrengthState {
  /** 0 when empty, 1 to 4 otherwise. */
  score: number
  max: number
  /** Whether the password clears the rule the server enforces. */
  meetsRequirement: boolean
  /** A common password, a repeat, or a keyboard run. */
  guessable: boolean
}

export function evaluatePassword(value: string): PasswordStrengthState {
  const max = BANDS.length
  const trimmed = value.trim()

  if (value.length === 0) {
    return { score: 0, max, meetsRequirement: false, guessable: false }
  }

  const meetsRequirement = signupSchema.shape.password.safeParse(value).success
  const guessable = COMMON.test(value) || REPEATED.test(value) || SEQUENCE.test(value)

  // One bar for something typed, then one per band cleared. A guessable
  // password never rises above the first bar however long it is.
  const earned = BANDS.reduce((n, band) => n + (trimmed.length >= band ? 1 : 0), 0)
  const score = guessable ? 1 : Math.max(1, earned)

  return { score, max, meetsRequirement, guessable }
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

export function PasswordStrength({ value, className = '' }: { value: string; className?: string }) {
  const t = useTranslations('account')
  const state = useMemo(() => evaluatePassword(value), [value])
  const { score, max, meetsRequirement, guessable } = state

  const labels = [
    t('strengthEmpty'),
    t('strengthWeak'),
    t('strengthFair'),
    t('strengthGood'),
    t('strengthStrong'),
  ]

  const sentence =
    value.length === 0
      ? ''
      : [
          t('strengthAnnounce', { label: labels[score] ?? '' }),
          guessable ? t('strengthGuessable') : '',
          meetsRequirement ? '' : t('passwordHint'),
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
        aria-valuetext={labels[score] ?? ''}
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
              } ${TONES[score] ?? TONES[0]} transition-transform duration-300`}
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
                TEXT_TONES[score] ?? TEXT_TONES[0]
              } ${i === score ? 'opacity-100' : 'opacity-0'}`}
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
        One requirement, because there is one. The tick is not the only signal:
        the word beside it changes too, so this does not rely on colour.
      */}
      <p className="mt-2.5 flex items-center gap-2 text-xs">
        <span
          aria-hidden
          className={`grid size-3.5 shrink-0 place-items-center border transition-colors duration-200 ${
            meetsRequirement
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
                meetsRequirement ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </svg>
        </span>
        <span className={meetsRequirement ? 'text-ink-700' : 'text-ink-500'}>
          {t('passwordHint')}
        </span>
      </p>

      {/* Said once, after a pause. See ANNOUNCE_DELAY. */}
      <p aria-live="polite" className="sr-only">
        {announced}
      </p>
    </div>
  )
}
