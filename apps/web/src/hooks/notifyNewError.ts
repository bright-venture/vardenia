import type { CollectionAfterChangeHook } from 'payload'

/**
 * Tell somebody the first time a new bug appears.
 *
 * The error-events table records everything and announces nothing, so the way
 * you found out something was broken was by opening the admin panel and
 * noticing. That works right up until the week nobody opens it.
 *
 * # Only on the first sighting, and that is not a compromise
 *
 * `reportError` looks the fingerprint up before writing: a bug that has
 * happened before is an `update` that bumps `count`, and only a genuinely new
 * one is a `create`. So `operation === 'create'` already means "this has never
 * happened before" - there is no need to inspect counts or timestamps, and a
 * crash loop sends exactly one message rather than ten thousand.
 *
 * The trade is that a bug which was ticked as resolved and has come back does
 * not mail again, because that is an update. It does untick `resolved`, so it
 * resurfaces in the admin list. Worth knowing rather than worth fixing: mailing
 * on every un-resolve would put the noisiest bug back in the inbox forever.
 *
 * # Why this cannot report its own failure
 *
 * Calling `reportError` here would be a loop: the report writes an error event,
 * which fires this hook, which fails again. It terminates after one round,
 * because the second write is an update rather than a create - but relying on
 * that is relying on a detail of another file to stop an email loop.
 *
 * So a failure here goes to the console and nowhere else. Netlify captures it.
 * An alerting system that can take down the thing it watches is worse than no
 * alerting system.
 *
 * # It must never throw
 *
 * An `afterChange` that throws fails the write. The record of what broke is
 * more valuable than the message about it, so every path here ends in a
 * swallowed catch.
 */

/** Where alerts go. Unset means the feature is off, which is the default. */
const recipient = () => process.env.ERROR_ALERT_TO?.trim() || null

const adminUrl = (id: string | number) => {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  return site ? `${site}/admin/collections/error-events/${id}` : null
}

export const notifyNewError: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return doc

  const to = recipient()
  if (!to) return doc

  try {
    const level = String(doc.level ?? 'error')
    const source = String(doc.source ?? 'unknown')
    const message = String(doc.message ?? '')
    const path = doc.path ? String(doc.path) : null
    const link = adminUrl(doc.id as string | number)

    /**
     * Plain text, deliberately. This goes to whoever is on call, gets read on a
     * phone, and its whole job is to say what broke and where to look. An HTML
     * template would be a second thing to keep in step with the palette for no
     * gain - and the body already contains a stack trace, which reads worse
     * wrapped in markup.
     */
    const body = [
      `A new ${level} appeared on Vardenia.`,
      '',
      `  ${message}`,
      '',
      `Source:  ${source}`,
      path ? `Path:    ${path}` : null,
      `First seen: ${doc.firstSeen ?? 'just now'}`,
      '',
      link ? `Open it: ${link}` : 'Find it under Analytics > Error Events in the admin panel.',
      '',
      'You will not be mailed again about this one. Repeats increment a counter',
      'on the same record rather than creating a new one.',
    ]
      .filter((line) => line !== null)
      .join('\n')

    await req.payload.sendEmail({
      to,
      // The source leads, because it is what tells you which part of the site
      // is affected before you have opened anything.
      subject: `[Vardenia] ${level}: ${source}`,
      text: body,
    })
  } catch (error) {
    // Console only. See the note above on why this must not call reportError.
    console.error('[error-alert] could not send the alert', error)
  }

  return doc
}
