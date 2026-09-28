'use client'

import { useField, useFormFields } from '@payloadcms/ui'

/**
 * A review as the reader will see it, and the decision on it.
 *
 * The review screen was a stack of form fields: the listing, a number for the
 * rating, then the title and the guest's message as two plain inputs among
 * eight others. Moderating is reading, so the message is what the page should
 * lead with: the stars, the title and the words set as a quote, with who wrote
 * it and when. Under it, the only decision staff make, as two buttons.
 *
 * The buttons set the status field like its dropdown does; Save records it.
 */

type Status = 'pending' | 'published' | 'rejected'

const STATE: Record<Status, { text: string; className: string }> = {
  pending: { text: 'Waiting for approval', className: 'vd-pill vd-pill--warn' },
  published: { text: 'Published: guests can see it', className: 'vd-pill vd-pill--ok' },
  rejected: { text: 'Rejected: hidden from guests', className: 'vd-pill vd-pill--off' },
}

export function ReviewCard() {
  const { rating, title, body, author, created } = useFormFields(([fields]) => ({
    rating: Number(fields.rating?.value) || 0,
    title: String(fields.title?.value ?? '').trim(),
    body: String(fields.body?.value ?? '').trim(),
    author: String(fields.authorName?.value ?? '').trim(),
    created: String(fields.createdAt?.value ?? ''),
  }))
  const { value: status, setValue } = useField<Status>({ path: 'status' })

  const state = STATE[status] ?? STATE.pending
  const stars = Math.max(0, Math.min(5, Math.round(rating)))
  const when = created
    ? new Date(created).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : ''

  return (
    <section className={`vd-review${status === 'pending' ? 'vd-review--pending' : ''}`}>
      <div className="vd-review__top">
        <span className="vd-review__stars" aria-label={`${stars} out of 5 stars`}>
          {'★'.repeat(stars)}
          <span className="vd-review__stars-off">{'★'.repeat(5 - stars)}</span>
        </span>
        <span className={state.className}>{state.text}</span>
      </div>

      {title ? <h2 className="vd-review__title">{title}</h2> : null}
      <blockquote className="vd-review__body">
        {body || <span className="vd-muted">No message.</span>}
      </blockquote>
      <p className="vd-review__by">
        {author || 'A guest'}
        {when ? ` · ${when}` : ''}
      </p>

      <div className="vd-review__actions">
        {status !== 'published' ? (
          <button
            type="button"
            className="vd-choice vd-choice--keep"
            onClick={() => setValue('published')}
          >
            Publish
          </button>
        ) : null}
        {status !== 'rejected' ? (
          <button
            type="button"
            className="vd-choice vd-choice--remove"
            onClick={() => setValue('rejected')}
          >
            Reject
          </button>
        ) : null}
        <span className="vd-muted">
          Then press Save. Publish if it is a fair review, good or bad; reject abuse, spam or a
          review that is not about this place.
        </span>
      </div>
    </section>
  )
}

export default ReviewCard
