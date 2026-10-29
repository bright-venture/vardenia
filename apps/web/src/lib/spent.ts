/**
 * "Roughly how much did you spend?", read leniently: "120", "120.50" and
 * "1,200" all mean what they say, and anything unreadable is simply no answer.
 * It is a guest's estimate, never required, so a typo must not cost them the
 * answer they came to give.
 *
 * `max` is a ceiling against typos, not a price: a receipt in Lebanese pounds
 * runs into the millions, so its caller passes a higher one.
 */
export function readSpent(raw: unknown, max = 1_000_000): number | null {
  const cleaned = String(raw ?? '')
    .replace(/[\s,$]/g, '')
    .trim()
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const value = Number(cleaned)
  return value > 0 && value < max ? value : null
}
