/**
 * The JSON body of a staff action endpoint, read strictly: a plain object
 * whose keys are all in the action's allow-list. Anything else (not JSON, an
 * array, an unknown key) is refused with 400 before the action runs, so a
 * field nobody meant to send can never reach the record.
 */

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

export type BodyResult =
  { ok: true; body: Record<string, unknown> } | { ok: false; response: Response }

export async function readActionBody(
  req: { json?: () => Promise<unknown> },
  allowed: readonly string[],
): Promise<BodyResult> {
  let raw: unknown
  try {
    raw = (await req.json?.()) ?? {}
  } catch {
    return {
      ok: false,
      response: json({ error: 'Send the request as JSON.', code: 'bad-input' }, 400),
    }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      response: json({ error: 'Send the request as a JSON object.', code: 'bad-input' }, 400),
    }
  }
  const unknown = Object.keys(raw).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) {
    return {
      ok: false,
      response: json(
        { error: `Unexpected field: ${unknown.slice(0, 3).join(', ')}.`, code: 'bad-input' },
        400,
      ),
    }
  }
  return { ok: true, body: raw as Record<string, unknown> }
}
