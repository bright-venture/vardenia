/*
 * Load test of the public site: how it holds up when many people browse at once.
 *
 * Each simulated visitor does what a reader does: opens the home page, a
 * section, the directory, then a couple of listings, pausing a few seconds
 * between pages as a person would. Only pages are opened. Nothing is booked,
 * signed up for, sent or saved, so the test leaves no data behind.
 *
 * Left out on purpose:
 *   - QR links (/g/<code>): every hit there is counted as a scan, and would
 *     put fake scans into the places' statistics.
 *   - Sign-in, booking and receipt routes: they are rate limited per address,
 *     and every simulated visitor comes from this one computer, so the test
 *     would only measure the blocking.
 *   - Images and scripts: served from Netlify's CDN, not by the site's own
 *     functions and database, which is what this measures.
 *
 * Run (PowerShell, from the repo root):
 *
 *   k6 run -e SMOKE=1 load-tests/site.js       # one visitor, once: check it works first
 *   k6 run load-tests/site.js                  # climbs to 50 visitors, about 7 minutes
 *   k6 run -e PEAK=100 load-tests/site.js      # climb to another peak
 *
 * If the coming-soon gate is ever up again, set $env:PREVIEW_TOKEN to the value
 * of COMING_SOON_PREVIEW_TOKEN first. It is read from the environment and never
 * written in this file. The gate serves its splash at the same address, so the
 * check below reads the page title rather than the URL.
 *
 * The test stops by itself if more than 10% of pages fail, so a site that is
 * falling over is not pushed further.
 *
 * Measured 5 Nov 2026: at 50 visitors every page answered, 95% in under 0.4 s.
 * Both full runs then stopped after about 1,150 pages in 6.5 minutes, because
 * Netlify (not the site, not Cloudflare) answered 403 to everything from this
 * one address for a short while. That is a limit on one address, which a real
 * crowd on many phones does not hit. To measure past it, run from several
 * addresses (for example Grafana Cloud k6).
 */

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Counter } from 'k6/metrics'

/** Failed pages by status code and by who answered (Cloudflare, Netlify). */
const failures = new Counter('failed_pages')
let reported = 0

const BASE = (__ENV.BASE_URL || 'https://vardenia.com').replace(/\/$/, '')
const TOKEN = __ENV.PREVIEW_TOKEN || ''
const PEAK = Number(__ENV.PEAK || 50)
const SMOKE = Boolean(__ENV.SMOKE)

const SECTIONS = ['stay', 'eat-and-drink', 'experiences', 'weddings', 'lifestyle', 'getting-around']

// Forty real listings, drawn at random from the 1,346 published on 5 Nov 2026.
const LISTINGS = [
  'sabah-lodge',
  'al-droub',
  'sa7net-aley',
  'hemme-w-nafas',
  'ahwet-l-jiran',
  'mansour-aim',
  'droub-zahle',
  'encore-7ekye',
  'qasr-play-park',
  'watar-bel-lel',
  'shabek-azraq',
  'nour-el-may',
  'ahwet-georges',
  'lo2met-ghazieh',
  'zaatarna',
  'rashfe-2',
  'maroun-pool',
  'gharbet-roum',
  'kitab-w-cup',
  'darb-el-hayakel',
  'nawras',
  'shams-pool-club',
  'lo2me-w-de7ke',
  'fas7et-kfar',
  'tallet-bkassine',
  'marjan',
  'sab3-ghoraf',
  'bayt-el-teen',
  'benn-el-tari2',
  'chez-dina',
  'sukkar-khafif',
  'waqfet-qahwe',
  'marsa-layali',
  'ahwet-el-jiran',
  'sahret-joud',
  'lawn-3al-sa7n',
  'tawlet-el-balad',
  'dar-el-zouwar',
  'matbakh-may',
  'book-w-rakwe',
]

export const options = SMOKE
  ? { vus: 1, iterations: 1 }
  : {
      scenarios: {
        browsing: {
          executor: 'ramping-vus',
          startVUs: 0,
          stages: [
            { duration: '1m', target: Math.ceil(PEAK / 5) },
            { duration: '1m', target: Math.ceil(PEAK / 2) },
            { duration: '2m', target: PEAK },
            { duration: '2m', target: PEAK },
            { duration: '1m', target: 0 },
          ],
          gracefulRampDown: '30s',
        },
      },
      thresholds: {
        // Stop early if the site is clearly failing.
        http_req_failed: [{ threshold: 'rate<0.10', abortOnFail: true, delayAbortEval: '30s' }],
        // The goals: under 1% errors, and 95% of pages in under 2 seconds.
        'http_req_failed{any:yes}': ['rate<0.01'],
        'http_req_duration{any:yes}': ['p(95)<2000'],
        'http_req_duration{page:home}': ['p(95)<2000'],
        'http_req_duration{page:section}': ['p(95)<2000'],
        'http_req_duration{page:directory}': ['p(95)<2000'],
        'http_req_duration{page:listing}': ['p(95)<2000'],
      },
    }

const params = (page) => ({
  headers: {
    'User-Agent': 'vardenia-load-test (k6)',
    ...(TOKEN ? { Cookie: `vd_preview=${TOKEN}` } : {}),
  },
  tags: { page, any: 'yes' },
})

const pick = (list) => list[Math.floor(Math.random() * list.length)]

/** A real person reads for a few seconds before the next page. */
const pause = () => sleep(SMOKE ? 0.5 : 2 + Math.random() * 4)

function open(path, page) {
  const res = http.get(`${BASE}${path}`, params(page))
  const title = (/<title>([^<]*)<\/title>/.exec(String(res.body)) || [])[1] || ''
  check(res, {
    'page opened (200)': (r) => r.status === 200,
    // A missing page fails the check above (404). The splash answers 200 at the
    // same address, titled "Vardenia" alone; every real page has more.
    'the real page, not the coming-soon splash': () =>
      title.trim() !== '' && title.trim() !== 'Vardenia',
  })
  if (res.status !== 200) {
    const server = String(res.headers['Server'] || res.headers['server'] || '?')
    failures.add(1, { status: String(res.status), server })
    // The first few in each visitor, with what answered, so a block by
    // Cloudflare reads differently from the site itself failing.
    if (reported < 3) {
      reported++
      const blocked = /cloudflare|attention required|just a moment|rate limit/i.test(
        String(res.body).slice(0, 2000),
      )
      console.warn(
        `${res.status} from ${server}${blocked ? ' (Cloudflare block page)' : ''}  ${path}  ` +
          `ray=${res.headers['Cf-Ray'] || '-'}  netlify=${res.headers['X-Nf-Request-Id'] || '-'}`,
      )
    }
  }
  if (SMOKE) console.log(`${res.status}  ${Math.round(res.timings.duration)} ms  ${path}  ${title}`)
  return res
}

export default function () {
  // One in five readers browses in Arabic.
  const prefix = Math.random() < 0.2 ? '/ar' : ''

  group('home', () => open(prefix || '/', 'home'))
  pause()
  group('section', () => open(`${prefix}/${pick(SECTIONS)}`, 'section'))
  pause()
  group('directory', () => open(`${prefix}/directory`, 'directory'))
  pause()
  group('listing', () => open(`${prefix}/directory/${pick(LISTINGS)}`, 'listing'))
  pause()
  group('listing', () => open(`${prefix}/directory/${pick(LISTINGS)}`, 'listing'))
  pause()
}
