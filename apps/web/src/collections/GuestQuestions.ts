import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { isStaff } from '../access/index'
import { reportError } from '../lib/report'

/**
 * Questions guests send from the bottom of the Questions page (18 November
 * 2026). No account is needed; POST /booking/question is the only way in, with
 * the same bot check as sign-up and a rate limit. The team answers by email
 * and marks the question Answered here.
 */

/**
 * Sends the team's answer to the guest, once (18 November 2026). The team is
 * not emailed about new questions: they see them here. When someone writes an
 * Answer and sets the status to Answered, the guest gets that answer by email,
 * in plain text, and the time is stamped so it is never sent twice.
 */
const sendAnswer: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  if (operation !== 'update' || !data) return data
  const status = data.status ?? originalDoc?.status
  const answer = String(data.answer ?? originalDoc?.answer ?? '').trim()
  if (status !== 'answered' || !answer || originalDoc?.answeredAt) return data
  try {
    await req.payload.sendEmail({
      to: String(originalDoc?.email ?? data.email),
      subject: 'Your question to Vardenia',
      text: [
        `${originalDoc?.name ?? data.name},`,
        '',
        'You asked:',
        String(originalDoc?.question ?? data.question ?? ''),
        '',
        answer,
        '',
        'Vardenia',
      ].join('\n'),
    })
    data.answeredAt = new Date().toISOString()
  } catch (error) {
    // Not stamped, so saving again retries. Reported, so a guest left without
    // their answer shows up in the error list and Sentry, not only in a log.
    await reportError(error, {
      source: 'guest-question.answer-email',
      extra: { question: originalDoc?.id },
    })
  }
  return data
}

export const GuestQuestions: CollectionConfig = {
  slug: 'guest-questions',
  labels: { singular: 'Guest question', plural: 'Guest questions' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'status', 'createdAt'],
    group: 'People',
    description:
      'Asked from the Questions page. Write the Answer, set the status to Answered and save: the guest gets the answer by email.',
  },
  access: { read: isStaff, create: isStaff, update: isStaff, delete: isStaff },
  hooks: { beforeChange: [sendAnswer] },
  fields: [
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      index: true,
      options: [
        { label: 'New', value: 'new' },
        { label: 'Answered', value: 'answered' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', required: true, maxLength: 120 },
        { name: 'email', type: 'email', required: true },
      ],
    },
    { name: 'question', type: 'textarea', required: true, maxLength: 2000 },
    {
      name: 'answer',
      type: 'textarea',
      maxLength: 4000,
      admin: {
        description:
          'Sent to the guest by email when the status is Answered and you save. Sent once.',
      },
    },
    {
      name: 'answeredAt',
      label: 'Answer sent',
      type: 'date',
      admin: { readOnly: true, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    { name: 'locale', type: 'text', admin: { readOnly: true } },
    {
      name: 'internalNotes',
      type: 'textarea',
      admin: { description: 'For the team only.' },
    },
  ],
}
