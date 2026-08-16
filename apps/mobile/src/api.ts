/**
 * The app's intended single API entry point. NOTHING IMPORTS THIS YET.
 *
 * The principle holds: nothing else in the app should call `fetch` directly,
 * because routing every request through one client gives a single place to add
 * retry, offline caching and auth.
 *
 * But the client underneath is written against an API that was never built, so
 * every call through it would fail. Read the header of
 * packages/api-client/src/index.ts before wiring this into a screen.
 */

import { createClient } from '@vardenia/api-client'
import { getLocales } from 'expo-localization'

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api'

const deviceLocale = getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en'

export const api = createClient({
  baseUrl,
  locale: deviceLocale,
  // Lebanese mobile networks are uneven; fail slower than the web default.
  timeoutMs: 15_000,
})
