/** The largest id a Postgres integer column holds. */
const MAX_ID = 2147483647

/** An issue id from a query string: a positive whole number a database id can be, else null. */
export function issueParam(raw: string | null): number | null {
  if (raw === null || !/^[1-9]\d{0,9}$/.test(raw)) return null
  const id = Number(raw)
  return id <= MAX_ID ? id : null
}
