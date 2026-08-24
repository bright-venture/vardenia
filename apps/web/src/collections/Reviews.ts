import type { CollectionConfig } from 'payload'
import { isStaff, publishedOrStaff } from '../access/index'

/**
 * A review of a listing, written by Vardenia.
 *
 * # Nobody but staff can write one, and that is the design
 *
 * Not a limitation to be lifted later. Customers cannot submit reviews and
 * businesses cannot submit reviews about themselves, because the moment either
 * is possible the directory becomes a place where a restaurant's rating is a
 * function of how many friends it asked. Vardenia's proposition is that
 * somebody went and looked; a review is the written form of that visit.
 *
 * So `create`, `update` and `delete` are all `isStaff`, with no owner clause
 * and no relationship to the customer who made a booking. There is deliberately
 * no public write endpoint of any kind. If guest reviews are ever wanted they
 * need a separate collection with its own moderation, not a loosened rule here.
 *
 * # Why `source` exists
 *
 * Because "who is speaking" changes what may be claimed about it in structured
 * data, and getting that wrong is a search-ranking penalty rather than a
 * cosmetic bug. Google allows a publisher to mark up its own critic review as a
 * `Review` authored by the publisher. It does not allow that review to be
 * aggregated into an `aggregateRating`, which is meant to summarise ratings
 * from many independent people.
 *
 * The three values below are the ones that actually differ:
 *
 * - `editorial`   Vardenia visited and wrote it. Marked up as a critic review,
 *                 authored by the organisation. Never aggregated.
 * - `guest`       A real guest said this and staff transcribed it, with the
 *                 guest's permission. Aggregatable.
 * - `partner`     Supplied by the business. Displayed as a quote, never marked
 *                 up as a review at all, because it is the subject talking
 *                 about itself.
 *
 * See lib/reviews.ts, which is where that rule is enforced rather than merely
 * described.
 *
 * # Ratings are integers
 *
 * One to five, no halves. A half-star editorial rating implies a precision that
 * a single visit does not support, and the aggregate can still land on 4.5
 * because it is a mean of integers.
 */
export const Reviews: CollectionConfig = {
  slug: 'reviews',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'business', 'rating', 'source', 'visitedAt', '_status'],
    group: 'Directory',
    listSearchableFields: ['title', 'body', 'authorName'],
    description:
      'Reviews written by Vardenia staff. Businesses and customers cannot create these.',
  },
  versions: { drafts: true, maxPerDoc: 10 },
  access: {
    /**
     * Public reads see published reviews only; staff also see drafts.
     *
     * A constraint rather than a boolean, so Payload filters in the database
     * and an anonymous caller cannot page past it or count what is hidden.
     */
    read: publishedOrStaff,
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  fields: [
    {
      name: 'business',
      type: 'relationship',
      relationTo: 'businesses',
      required: true,
      index: true,
      admin: {
        description: 'The listing this review is about.',
      },
    },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'editorial',
      index: true,
      options: [
        { label: 'Editorial - we visited and wrote it', value: 'editorial' },
        { label: 'Guest - a real guest said this, transcribed with permission', value: 'guest' },
        { label: 'Partner supplied - the business gave us this quote', value: 'partner' },
      ],
      admin: {
        description:
          'Decides how this is marked up for search engines. Only Guest reviews count towards the average rating shown on the listing. Partner quotes are never marked up as reviews.',
      },
    },
    {
      name: 'rating',
      type: 'number',
      required: true,
      min: 1,
      max: 5,
      admin: {
        step: 1,
        description: 'Whole numbers only, 1 to 5.',
      },
      /**
       * Belt and braces over `min`/`max`.
       *
       * Payload enforces the range, but not integrality, and a 4.5 stored here
       * would render a half star the editorial process cannot justify. The
       * database column is numeric, so this is the only place it is caught.
       */
      validate: (value: number | null | undefined) => {
        if (value === null || value === undefined) return 'A rating is required.'
        if (!Number.isInteger(value)) return 'Use a whole number from 1 to 5.'
        if (value < 1 || value > 5) return 'Use a whole number from 1 to 5.'
        return true
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      maxLength: 90,
      admin: {
        description: 'One line. This is the headline of the review, not the name of the place.',
      },
    },
    {
      name: 'body',
      type: 'textarea',
      required: true,
      localized: true,
      maxLength: 1200,
      admin: {
        description: 'What was it actually like. Two or three sentences is usually enough.',
      },
    },
    {
      name: 'authorName',
      type: 'text',
      localized: true,
      admin: {
        description:
          'Who is speaking. Leave blank for an editorial review, which is attributed to Vardenia.',
        condition: (data) => data?.source !== 'editorial',
      },
    },
    {
      name: 'visitedAt',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayOnly' },
        description:
          'When the visit happened. Shown to the reader, because a review of a restaurant from three years ago is a different claim from one from last month.',
      },
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Pin to the top of the listing page. One per listing is the intent; more than one just sorts them together.',
      },
    },
    {
      /**
       * The published date is what the reader and the structured data see, and
       * it is separate from `createdAt` because a review may be written weeks
       * before the listing goes live.
       */
      name: 'publishedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayOnly' },
      },
    },
  ],
  /**
   * Newest first by default in the admin list, so the most recent work is at
   * the top where somebody checking their own edits will look for it.
   */
  defaultSort: '-createdAt',
}
