import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale } from '@vardenia/i18n'
import { getMessages } from '@vardenia/i18n/messages'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = requested && isLocale(requested) ? requested : DEFAULT_LOCALE

  return {
    locale,
    messages: getMessages(locale),
    timeZone: 'Asia/Beirut',
  }
})
