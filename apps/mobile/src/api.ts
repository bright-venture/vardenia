/**
 * The app's single API entry point.
 *
 * Nothing else in the app should call `fetch` directly - routing every request
 * through the shared client is what keeps the mobile app honest about the API
 * contract and gives us one place to add retry, offline caching, and auth.
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
