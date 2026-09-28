/**
 * Where a statement may go from each status.
 *
 * Forward only, with one way back: a payment recorded by mistake can be undone
 * (paid to sent). Sent never returns to draft, because the venue already has
 * the email; a wrong sent statement is voided and drawn up again. Void is final
 * for the same reason, and voiding is what frees the month for a new one.
 */
export const STATEMENT_MOVES: Record<string, readonly string[]> = {
  draft: ['sent', 'void'],
  sent: ['paid', 'void'],
  paid: ['sent'],
  void: [],
}
