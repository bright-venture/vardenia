import { z } from 'zod'

/**
 * What a customer sends to leave a review.
 *
 * In core, not the web app, because the mobile app will post the same shape. As
 * with a booking, this only decides whether the request is well-formed - not
 * whether the person is allowed to review, which is a completed booking and an
 * approval step the endpoint enforces (see /reviews and lib/review-service).
 */
export const reviewRequestSchema = z.object({
  /** Which listing is being reviewed. */
  business: z.union([z.string().min(1), z.number()]),

  /** One to five stars, whole numbers only. */
  rating: z.coerce.number().int().min(1, 'required').max(5, 'too high'),

  /** Optional one-line summary. */
  title: z.string().trim().max(120, 'too long').optional(),

  /** The review itself. A floor so a one-word "ok" is not a review; a ceiling to bound it. */
  body: z.string().trim().min(10, 'please say a little more').max(2000, 'too long'),

  /** Which language the customer wrote in, for later messages. */
  locale: z.enum(['en', 'ar']).optional(),
})

export type ReviewRequest = z.infer<typeof reviewRequestSchema>
