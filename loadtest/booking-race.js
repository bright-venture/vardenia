// The race for the last table: many customers ask for the same slot at the
// same moment. The pass condition is that never more bookings succeed than the
// listing has capacity for; everyone else must be refused with 409
// ("no longer available"), never a 500.
//
// THIS WRITES REAL BOOKINGS to the shared test database and sends the booking
// emails (venue and customer). Use ONLY:
//   - a test listing whose owner email goes to a mailbox you control,
//   - test customer accounts with verified email addresses,
//   - a slot far in the future, and cancel/delete the bookings afterwards.
// Tell your teammate before running it: the database is shared.
//
// Booking is a write, limited to 20 requests a minute per address
// (WRITE_PER_WINDOW), so this sends exactly COUNT (max 20) requests once.
//
// Customers are identified by the value of the `payload-token` cookie of each
// signed-in test customer. Provide them in your terminal only:
//   -e COOKIES=token1,token2,token3   (more than one customer is recommended: a
//   single customer is also limited to 15 upcoming bookings)
//
//   k6 run -e BASE=... -e BUSINESS_ID=123 -e START=... -e END=... -e PARTY=2 \
//          -e CAPACITY=1 -e COUNT=10 -e COOKIES=... [-e AREA=...] booking-race.js
import http from 'k6/http'
import { check } from 'k6'
import { Counter } from 'k6/metrics'
import { BASE, wallHeaders, ensureWall, wallCookies } from './common.js'

const need = (n) => {
  if (!__ENV[n]) throw new Error(`Set -e ${n}=...`)
  return __ENV[n]
}
const BUSINESS = need('BUSINESS_ID')
const START = need('START')
const END = need('END')
const PARTY = Number(__ENV.PARTY || 2)
const CAPACITY = Number(need('CAPACITY')) // how many of this slot can exist
const COUNT = Math.min(Number(__ENV.COUNT || 10), 20)
const COOKIES = need('COOKIES')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const created = new Counter('bookings_created')
const refused = new Counter('bookings_refused_409')
const serverErrors = new Counter('bookings_server_error')
const other = new Counter('bookings_other_status')

export const options = {
  scenarios: {
    race: { executor: 'shared-iterations', vus: COUNT, iterations: COUNT, maxDuration: '1m' },
  },
  thresholds: {
    bookings_created: [`count<=${CAPACITY}`], // the one that matters: no overbooking
    bookings_server_error: ['count==0'],
  },
}

export default function () {
  ensureWall()
  const cookie = COOKIES[(__VU - 1) % COOKIES.length]
  const body = { business: BUSINESS, start: START, end: END, partySize: PARTY }
  if (__ENV.AREA) body.area = __ENV.AREA
  const res = http.post(`${BASE}/booking/request`, JSON.stringify(body), {
    headers: { ...wallHeaders(), 'content-type': 'application/json' },
    cookies: { ...wallCookies(), 'payload-token': cookie },
  })
  if (res.status === 200 || res.status === 201) created.add(1)
  else if (res.status === 409) refused.add(1)
  else if (res.status >= 500) serverErrors.add(1)
  else other.add(1) // 401 signed out, 403 unverified, 429 rate limit, 400 bad request
  check(res, { 'answered with a decision (not a crash)': (r) => r.status < 500 })
}

export function teardown() {
  console.log(
    `Capacity for this slot: ${CAPACITY}. Cancel the test bookings now (admin or the customers' accounts).`,
  )
}
