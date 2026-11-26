// Shared settings for the Vardenia k6 scripts. Nothing secret lives in these
// files: every credential comes from an environment variable you set in your
// own terminal (-e NAME=value) and is never written to disk or committed.
import encoding from 'k6/encoding'

export const BASE = (__ENV.BASE || '').replace(/\/$/, '')
if (!BASE) throw new Error('Set -e BASE=https://your-staging-address (no trailing slash)')

// Never allow the scripts to point at production by accident.
const PROD_HOSTS = (__ENV.PROD_HOSTS || 'vardenia.com,www.vardenia.com,vardenia.app').split(',')
if (PROD_HOSTS.some((h) => h && BASE.includes(h))) {
  throw new Error('BASE looks like production. These scripts are for staging only.')
}

// Staging sits behind Netlify Password Protection: the first request gets a
// 401 page with a password form (one shared site password, no username). A
// browser posts the form and keeps a cookie; so does each virtual user here,
// once, on its first iteration. Pass the password only in your own terminal:
//   -e WALL_PASS=...
// (Basic auth is also supported with WALL_USER and WALL_PASS, in case the wall
// is ever changed to that.)
import http from 'k6/http'

import { Counter } from 'k6/metrics'

let loggedIn = false // module state is per virtual user in k6
export const wallLogins = new Counter('wall_logins')

export function wallHeaders() {
  if (__ENV.WALL_USER && __ENV.WALL_PASS) {
    const token = encoding.b64encode(`${__ENV.WALL_USER}:${__ENV.WALL_PASS}`)
    return { Authorization: `Basic ${token}` }
  }
  return {}
}

// Preferred: log in once in your browser, then pass that session cookie:
//   -e WALL_COOKIE_NAME=<cookie name> -e WALL_COOKIE=<cookie value>
// No login request is made at all, so the wall's login limit (429/403) is never hit.
export function wallCookies() {
  return __ENV.WALL_COOKIE_NAME && __ENV.WALL_COOKIE
    ? { [__ENV.WALL_COOKIE_NAME]: __ENV.WALL_COOKIE }
    : {}
}

export function ensureWall() {
  if (loggedIn || wallCookies()[__ENV.WALL_COOKIE_NAME] || !__ENV.WALL_PASS || __ENV.WALL_USER)
    return
  const res = http.post(
    `${BASE}/`,
    { 'form-name': 'form 1', password: __ENV.WALL_PASS },
    { redirects: 5 },
  )
  if (res.status !== 200) {
    throw new Error(`The access wall did not accept the password (status ${res.status}).`)
  }
  loggedIn = true
  wallLogins.add(1)
}

// GET that logs in again once if the wall answers 401 (cookie dropped).
export function wallGet(url, params) {
  ensureWall()
  // The first attempt may be refused by the wall (it drops its cookie), which
  // is expected and retried, so it is not counted as a failed request. The
  // retry must succeed, and is counted if it does not.
  const walled = __ENV.WALL_PASS && !__ENV.WALL_USER && !__ENV.WALL_COOKIE
  let res = http.get(url, {
    ...params,
    cookies: { ...wallCookies(), ...((params && params.cookies) || {}) },
    responseCallback: walled ? http.expectedStatuses(200, 401) : http.expectedStatuses(200),
  })
  if (res.status === 401 && walled) {
    loggedIn = false
    ensureWall()
    res = http.get(url, { ...params, responseCallback: http.expectedStatuses(200) })
  }
  return res
}
