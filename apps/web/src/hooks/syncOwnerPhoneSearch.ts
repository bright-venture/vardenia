import type { CollectionBeforeChangeHook } from 'payload'
import { phoneSearchValue } from '../lib/owner-phone-search'

/**
 * Keeps `submission.ownerPhoneSearch` (the owner's phone in one shape, for the
 * admin search) in step with `submission.ownerPhone`. Runs on every save that
 * carries the phone; the search column is never taken from the request, so it
 * cannot be set to anything but what the phone says. See lib/owner-phone-search.
 */
export const syncOwnerPhoneSearch: CollectionBeforeChangeHook = ({ data }) => {
  const submission = data?.submission as Record<string, unknown> | undefined
  if (!submission) return data
  if ('ownerPhone' in submission) {
    return {
      ...data,
      submission: { ...submission, ownerPhoneSearch: phoneSearchValue(submission.ownerPhone) },
    }
  }
  if ('ownerPhoneSearch' in submission) {
    // Not changing the phone, so not changing what is searched either.
    const rest = { ...submission }
    delete rest.ownerPhoneSearch
    return { ...data, submission: rest }
  }
  return data
}
