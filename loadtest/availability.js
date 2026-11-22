// Availability checks: GET /booking/availability. Read-only, but it hits the
// database on every call and is never cached.
//
// The endpoint allows 300 requests a minute per address (lib/rate-limit,
// MAX_PER_WINDOW), so one machine can only send 5 a second. This script stays
// at 4 a second and treats any 429 as a failure of the test setup, not of the
// site. To test above that you need several machines, or a temporary higher
// limit on staging that the team agrees to; do not weaken the limit in the
// repo for this.
//
//   k6 run -e BASE=... -e BUSINESS_ID=123 -e START=2027-03-01T19:00:00.000Z \
//          -e END=2027-03-01T21:00:00.000Z -e PARTY=2 [-e AREA=...] [-e PACKAGE_ID=...] availability.js
import http from 'k6/http'
import { check } from 'k6'
import { Counter } from 'k6/metrics'
import { BASE, wallHeaders, wallGet } from './common.js'

const need = (n) => {
  if (!__ENV[n]) throw new Error(`Set -e ${n}=...`)
  return __ENV[n]
}
const BUSINESS = need('BUSINESS_ID')
const START = need('START')
const END = need('END')
const PARTY = __ENV.PARTY || '2'

const rateLimited = new Counter('rate_limited_429')

export const options = {
  scenarios: {
    steady: {
      executor: 'constant-arrival-rate',
      rate: 4,
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 10,
      maxVUs: 30,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    rate_limited_429: ['count==0'],
  },
}

export default function () {
  const q = new URLSearchParams({ business: BUSINESS, start: START, end: END, partySize: PARTY })
  if (__ENV.AREA) q.set('area', __ENV.AREA)
  if (__ENV.PACKAGE_ID) q.set('packageId', __ENV.PACKAGE_ID)
  const res = wallGet(`${BASE}/booking/availability?${q}`, { headers: wallHeaders() })
  if (res.status === 429) rateLimited.add(1)
  check(res, {
    'status 200': (r) => r.status === 200,
    'has an answer': (r) => {
      try {
        return typeof r.json('ok') === 'boolean'
      } catch (e) {
        return false
      }
    },
  })
}
