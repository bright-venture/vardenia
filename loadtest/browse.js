// Browsing: home page, directory, one listing page. Read-only.
//
// Pages are served from cache or a light dynamic shell, so this mostly proves
// the CDN and the server hold up and shows what a cold page costs.
//
//   k6 run -e BASE=https://staging--vardenia.netlify.app -e LISTING_SLUG=some-slug \
//          -e WALL_USER=... -e WALL_PASS=... browse.js
import http from 'k6/http'
import { check, sleep } from 'k6'
import { BASE, wallHeaders, wallGet } from './common.js'

const SLUG = __ENV.LISTING_SLUG
if (!SLUG) throw new Error('Set -e LISTING_SLUG=<a published listing slug>')

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '3m', target: 30 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{page:home}': ['p(95)<1500'],
    'http_req_duration{page:directory}': ['p(95)<2500'],
    'http_req_duration{page:listing}': ['p(95)<1500'],
  },
}

const pages = [
  ['home', '/'],
  ['directory', '/directory'],
  ['directory', '/directory?page=2'],
  ['listing', `/directory/${SLUG}`],
]

export default function () {
  const headers = wallHeaders()
  const [name, path] = pages[Math.floor(Math.random() * pages.length)]
  const res = wallGet(`${BASE}${path}`, { headers, tags: { page: name } })
  check(res, { 'status 200': (r) => r.status === 200 })
  sleep(1 + Math.random() * 3)
}
