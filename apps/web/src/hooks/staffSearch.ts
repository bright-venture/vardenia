import type { CollectionBeforeOperationHook } from 'payload'
import { rewriteStaffSearch } from '../lib/owner-phone-search'

/**
 * Applies lib/owner-phone-search.rewriteStaffSearch to the Listings search.
 * Only reads; the rewrite touches only the phone and page-number clauses the
 * admin search generates.
 */
export const staffSearch: CollectionBeforeOperationHook = ({ args, operation }) => {
  if (operation !== 'read' && operation !== 'count') return args
  const where = (args as { where?: unknown }).where
  if (!where) return args
  const next = rewriteStaffSearch(where as never)
  return next === where ? args : { ...args, where: next }
}
