import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Records when the amount the guest spent was entered or changed.
 *
 * Kept beside the amount so a disputed figure carries its own date: one typed
 * the night of the visit reads differently from one typed after the guest had
 * already said otherwise. Server time, never the client's.
 */
export const stampAmountEnteredAt: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (!data || !('amount' in data)) return data

  const before = (originalDoc as { amount?: number | null } | undefined)?.amount ?? null
  const after = (data.amount as number | null | undefined) ?? null
  if (after !== before) data.amountEnteredAt = after === null ? null : new Date().toISOString()
  return data
}
