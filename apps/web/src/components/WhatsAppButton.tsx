import { getTranslations } from 'next-intl/server'

/**
 * A way to reach the Vardenia team on WhatsApp, from every page.
 *
 * In Lebanon a business is reached on WhatsApp far more readily than by email
 * or a form, for guests and venue owners alike; Lebanon Traveler carries the
 * same button on every page. It opens a chat with the team, with a first line
 * already written in the reader's language, so a tap is enough to start.
 *
 * The number is configuration, not copy: NEXT_PUBLIC_WHATSAPP_NUMBER, in
 * international form (961 and the number, with or without + or spaces). Unset
 * or malformed, the button does not render at all, rather than linking to a
 * chat with nobody. NEXT_PUBLIC_ is compiled into the build, so changing it
 * needs a redeploy.
 *
 * A server component and a plain link: no script, no widget, nothing loaded
 * from WhatsApp until somebody taps it.
 */

/** Digits only, without a leading 00; null unless it looks like a real number. */
export function whatsappNumber(raw: string | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '').replace(/^00/, '')
  return digits.length >= 8 && digits.length <= 15 ? digits : null
}

export async function WhatsAppButton() {
  const number = whatsappNumber(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER)
  if (!number) return null

  const t = await getTranslations('common')
  const href = `https://wa.me/${number}?text=${encodeURIComponent(t('whatsappMessage'))}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('whatsappLabel')}
      title={t('whatsappLabel')}
      /*
        Bottom and end: the right on an English page, the left on an Arabic one,
        and clear of a phone's home bar. Above page content, below dialogs.
      */
      className="focus-visible:outline-gold-500 fixed bottom-[max(1rem,env(safe-area-inset-bottom))] end-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none motion-reduce:hover:scale-100 sm:end-6 print:hidden"
    >
      <svg viewBox="0 0 32 32" aria-hidden="true" className="h-7 w-7" fill="currentColor">
        <path d="M16.004 3C8.832 3 3 8.83 3 16c0 2.29.6 4.53 1.74 6.51L3 29l6.66-1.74A12.95 12.95 0 0 0 16 29C23.17 29 29 23.17 29 16S23.17 3 16.004 3zm0 23.62c-1.98 0-3.92-.53-5.61-1.54l-.4-.24-3.95 1.03 1.05-3.85-.26-.4A10.6 10.6 0 0 1 5.37 16c0-5.86 4.77-10.63 10.64-10.63 5.86 0 10.63 4.77 10.63 10.63 0 5.87-4.77 10.62-10.64 10.62zm5.83-7.96c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.72.16-.21.32-.82 1.04-1.01 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.12 1.09-1.12 2.66s1.14 3.09 1.3 3.3c.16.21 2.25 3.43 5.45 4.81.76.33 1.35.52 1.81.67.76.24 1.46.21 2.01.13.61-.09 1.89-.77 2.16-1.52.27-.75.27-1.39.19-1.52-.08-.13-.29-.21-.61-.37z" />
      </svg>
    </a>
  )
}
