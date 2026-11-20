'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { numbersIn } from '@vardenia/core/listing-numbers'
import { NOTICE_INFO } from '../formStyles'
import type { NumbersIssue } from './use-place-numbers'

/**
 * Every listing number of a governorate, one button each.
 *
 * Free numbers can be picked; taken ones stay in place, greyed out and
 * disabled, so the owner sees the whole block and where the gaps are. A taken
 * number says "taken" in words as well as in style (colour is never the only
 * signal), and its accessible name says it too.
 *
 * Buttons with `aria-pressed` rather than radio inputs: up to a hundred radios
 * in one group would make arrow keys the only way through, and Tab still moves
 * through these one by one with disabled ones skipped.
 *
 * When the governorate has no block (`issues` empty) or every number is taken,
 * it says so; the form keeps Submit disabled in both cases.
 */
export function NumberPicker({
  issues,
  value,
  selectedIssue = null,
  onChange,
}: {
  issues: NumbersIssue[]
  value: number | null
  /** The issue `value` belongs to; null matches the first issue that holds it. */
  selectedIssue?: number | null
  onChange: (issueId: number, n: number) => void
}) {
  const t = useTranslations('magazinePlaces.numbers')
  const ids = useId()

  if (issues.length === 0) {
    return (
      <p className={NOTICE_INFO} role="status">
        {t('noRange')}
      </p>
    )
  }

  if (!hasFreeNumber(issues)) {
    return (
      <p className={NOTICE_INFO} role="status">
        {t('noneFree')}
      </p>
    )
  }

  const pressedIssue =
    value === null
      ? null
      : (selectedIssue ?? issues.find((i) => value >= i.from && value <= i.to)?.issueId ?? null)

  return (
    <div className="flex flex-col gap-5">
      {issues.map((issue) => {
        const taken = new Set(issue.taken)
        const numbers = numbersIn({ governorate: '', from: issue.from, to: issue.to })
        const free = numbers.filter((n) => !taken.has(n)).length
        const headingId = `${ids}-${issue.issueId}`
        return (
          <div key={issue.issueId} role="group" aria-labelledby={headingId}>
            <p id={headingId} className="text-ink-700 text-sm">
              {issue.issueTitle ? <span className="font-semibold">{issue.issueTitle}</span> : null}
              {issue.issueTitle ? ' \u00b7 ' : null}
              {t('freeCount', { free, total: numbers.length })}
            </p>
            <div className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-10">
              {numbers.map((n) => {
                const isTaken = taken.has(n)
                const pressed = !isTaken && pressedIssue === issue.issueId && value === n
                return (
                  <button
                    key={n}
                    type="button"
                    data-number={n}
                    disabled={isTaken}
                    aria-pressed={pressed}
                    aria-label={isTaken ? t('numberTaken', { n }) : t('number', { n })}
                    onClick={() => onChange(issue.issueId, n)}
                    className={`focus-visible:outline-gold-500 flex min-h-11 flex-col items-center justify-center border text-sm tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                      isTaken
                        ? 'border-ink-100 bg-surface-sunken text-ink-500 cursor-not-allowed'
                        : pressed
                          ? 'border-cedar-900 bg-cedar-900 text-surface-base font-semibold'
                          : 'border-ink-100 bg-surface-base text-ink-900 hover:border-ink-500'
                    }`}
                  >
                    <span className={isTaken ? 'line-through' : undefined}>{n}</span>
                    {isTaken ? <span className="text-xs leading-none">{t('taken')}</span> : null}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** At least one number, in any issue, that nobody holds. */
export function hasFreeNumber(issues: readonly NumbersIssue[]): boolean {
  return issues.some(
    (issue) =>
      issue.to - issue.from + 1 >
      new Set(issue.taken.filter((n) => n >= issue.from && n <= issue.to)).size,
  )
}
