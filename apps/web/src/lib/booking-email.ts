import type { Payload } from 'payload'
import type { BookingStatus } from '@vardenia/core'
import { dirFor, type Locale } from '@vardenia/i18n'
import { dateLocale } from './beirut'
import { reportError } from './report'
import { siteOrigin } from './auth-email'
import { emailPalette } from './email-palette'

/**
 * The confirmation a customer receives.
 *
 * Often the first email anyone gets from Vardenia, which makes it the message
 * that decides whether the next one lands in an inbox. Two things follow from
 * that, and both are about looking like real mail rather than like a template:
 *
 *  - **A plain-text part as well as HTML.** An HTML-only message with a link in
 *    it scores badly with every filter, and the text part is what a watch or a
 *    screen reader renders.
 *  - **No link at all in the body.** There is nothing for the customer to click
 *    yet - no booking management page exists - and a message whose only content
 *    is a URL is the shape of phishing. The reference is the payload here.
 *
 * Written in the customer's language, right-to-left when that is Arabic or Urdu.
 */

export interface BookingConfirmationArgs {
  payload: Payload
  to: string
  name: string
  reference: string
  status: BookingStatus
  start: Date
  end: Date
  partySize: number
  locale: Locale
}

const BEIRUT = 'Asia/Beirut'

/**
 * Formatted in Beirut, always.
 *
 * The instant is stored in UTC and the customer is standing in Lebanon. A
 * confirmation that says 17:00 for a 20:00 table is worse than no confirmation:
 * it is wrong in a way the reader has no way to detect.
 */
function formatWhen(date: Date, locale: Locale): string {
  // The language's own tag, from lib/beirut. Native digits, as the Arabic
  // email always had - this is the customer's own confirmation.
  return new Intl.DateTimeFormat(dateLocale(locale), {
    timeZone: BEIRUT,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    timeZone: BEIRUT,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

interface Copy {
  subject: string
  heading: string
  intro: string
  whenLabel: string
  untilLabel: string
  partyLabel: string
  referenceLabel: string
  closing: string
}

/*
 * Every UI language. These were English and Arabic only, and every caller
 * narrowed the booking's language to one of the two, so a customer who booked
 * in French was written to in English about their French booking. The record
 * types now refuse a language missing from any table here. The eight newer
 * languages follow each one's own interface wording and have not yet had a
 * native review - see lib/pages for the same note.
 */
const COPY: Record<Locale, Record<'confirmed' | 'pending', Copy>> = {
  en: {
    confirmed: {
      subject: 'Your booking is confirmed',
      heading: 'Booking confirmed',
      intro: 'Your table is booked. Please quote this reference if you need to change anything.',
      whenLabel: 'When',
      untilLabel: 'Until',
      partyLabel: 'People',
      referenceLabel: 'Reference',
      closing: 'We look forward to seeing you.',
    },
    pending: {
      subject: 'We have your booking request',
      heading: 'Booking requested',
      intro:
        'We have passed your request to the business and will write again as soon as they confirm. Nothing is reserved yet.',
      whenLabel: 'Requested for',
      untilLabel: 'Until',
      partyLabel: 'People',
      referenceLabel: 'Reference',
      closing: 'We will be in touch shortly.',
    },
  },
  ar: {
    confirmed: {
      subject: 'تم تأكيد حجزك',
      heading: 'تم تأكيد الحجز',
      intro: 'تم تأكيد حجزك. يرجى ذكر هذا الرقم عند الحاجة إلى أي تعديل.',
      whenLabel: 'الموعد',
      untilLabel: 'حتى',
      partyLabel: 'عدد الأشخاص',
      referenceLabel: 'رقم الحجز',
      closing: 'نتطلع إلى استقبالك.',
    },
    pending: {
      subject: 'وصلنا طلب حجزك',
      heading: 'تم استلام طلب الحجز',
      intro: 'أرسلنا طلبك إلى المكان وسنعاود الكتابة إليك فور تأكيده. لم يتم حجز أي شيء بعد.',
      whenLabel: 'الموعد المطلوب',
      untilLabel: 'حتى',
      partyLabel: 'عدد الأشخاص',
      referenceLabel: 'رقم الحجز',
      closing: 'سنتواصل معك قريبًا.',
    },
  },
  fr: {
    confirmed: {
      subject: 'Votre réservation est confirmée',
      heading: 'Réservation confirmée',
      intro:
        'Votre table est réservée. Indiquez cette référence si vous devez modifier quoi que ce soit.',
      whenLabel: 'Quand',
      untilLabel: "Jusqu'à",
      partyLabel: 'Personnes',
      referenceLabel: 'Référence',
      closing: 'Nous avons hâte de vous accueillir.',
    },
    pending: {
      subject: 'Nous avons reçu votre demande de réservation',
      heading: 'Réservation demandée',
      intro:
        "Nous avons transmis votre demande à l'établissement et vous écrirons dès qu'il aura confirmé. Rien n'est encore réservé.",
      whenLabel: 'Demandée pour',
      untilLabel: "Jusqu'à",
      partyLabel: 'Personnes',
      referenceLabel: 'Référence',
      closing: 'Nous revenons vers vous très vite.',
    },
  },
  es: {
    confirmed: {
      subject: 'Tu reserva está confirmada',
      heading: 'Reserva confirmada',
      intro: 'Tu mesa está reservada. Indica esta referencia si necesitas cambiar algo.',
      whenLabel: 'Cuándo',
      untilLabel: 'Hasta',
      partyLabel: 'Personas',
      referenceLabel: 'Referencia',
      closing: 'Te esperamos con ganas.',
    },
    pending: {
      subject: 'Hemos recibido tu solicitud de reserva',
      heading: 'Reserva solicitada',
      intro:
        'Hemos enviado tu solicitud al local y te escribiremos en cuanto la confirmen. Todavía no hay nada reservado.',
      whenLabel: 'Solicitada para',
      untilLabel: 'Hasta',
      partyLabel: 'Personas',
      referenceLabel: 'Referencia',
      closing: 'Te escribiremos en breve.',
    },
  },
  pt: {
    confirmed: {
      subject: 'Sua reserva está confirmada',
      heading: 'Reserva confirmada',
      intro: 'Sua mesa está reservada. Informe esta referência se precisar mudar alguma coisa.',
      whenLabel: 'Quando',
      untilLabel: 'Até',
      partyLabel: 'Pessoas',
      referenceLabel: 'Referência',
      closing: 'Esperamos por você.',
    },
    pending: {
      subject: 'Recebemos seu pedido de reserva',
      heading: 'Reserva solicitada',
      intro:
        'Enviamos seu pedido ao estabelecimento e voltaremos a escrever assim que ele confirmar. Nada está reservado ainda.',
      whenLabel: 'Solicitada para',
      untilLabel: 'Até',
      partyLabel: 'Pessoas',
      referenceLabel: 'Referência',
      closing: 'Entraremos em contato em breve.',
    },
  },
  ru: {
    confirmed: {
      subject: 'Ваше бронирование подтверждено',
      heading: 'Бронирование подтверждено',
      intro: 'Ваш столик забронирован. Если нужно что-то изменить, укажите этот номер.',
      whenLabel: 'Когда',
      untilLabel: 'До',
      partyLabel: 'Гостей',
      referenceLabel: 'Номер брони',
      closing: 'Будем рады вас видеть.',
    },
    pending: {
      subject: 'Мы получили ваш запрос на бронирование',
      heading: 'Запрос отправлен',
      intro:
        'Мы передали ваш запрос заведению и напишем снова, как только оно подтвердит. Пока ничего не забронировано.',
      whenLabel: 'Запрошено на',
      untilLabel: 'До',
      partyLabel: 'Гостей',
      referenceLabel: 'Номер брони',
      closing: 'Скоро свяжемся с вами.',
    },
  },
  zh: {
    confirmed: {
      subject: '您的预订已确认',
      heading: '预订已确认',
      intro: '您的餐位已订好。如需更改，请提供此预订编号。',
      whenLabel: '时间',
      untilLabel: '结束',
      partyLabel: '人数',
      referenceLabel: '预订编号',
      closing: '期待您的光临。',
    },
    pending: {
      subject: '我们已收到您的预订请求',
      heading: '已提交预订请求',
      intro: '我们已将您的请求转给商户，商户确认后会再次写信给您。目前尚未为您预留任何餐位。',
      whenLabel: '请求时间',
      untilLabel: '结束',
      partyLabel: '人数',
      referenceLabel: '预订编号',
      closing: '我们会尽快与您联系。',
    },
  },
  hi: {
    confirmed: {
      subject: 'आपकी बुकिंग पक्की हो गई है',
      heading: 'बुकिंग पक्की',
      intro: 'आपकी मेज़ बुक हो गई है। कुछ भी बदलना हो तो यह रेफ़रेंस नंबर बताएँ।',
      whenLabel: 'कब',
      untilLabel: 'समाप्ति',
      partyLabel: 'मेहमान',
      referenceLabel: 'रेफ़रेंस',
      closing: 'आपका इंतज़ार रहेगा।',
    },
    pending: {
      subject: 'हमें आपका बुकिंग अनुरोध मिल गया है',
      heading: 'बुकिंग का अनुरोध भेजा गया',
      intro:
        'हमने आपका अनुरोध उस जगह तक पहुँचा दिया है और उनकी पुष्टि होते ही फिर लिखेंगे। अभी कुछ भी बुक नहीं हुआ है।',
      whenLabel: 'अनुरोधित समय',
      untilLabel: 'समाप्ति',
      partyLabel: 'मेहमान',
      referenceLabel: 'रेफ़रेंस',
      closing: 'हम जल्द ही संपर्क करेंगे।',
    },
  },
  bn: {
    confirmed: {
      subject: 'আপনার বুকিং নিশ্চিত হয়েছে',
      heading: 'বুকিং নিশ্চিত',
      intro: 'আপনার টেবিল বুক করা হয়েছে। কিছু পরিবর্তন করতে চাইলে এই রেফারেন্সটি উল্লেখ করুন।',
      whenLabel: 'কখন',
      untilLabel: 'শেষ',
      partyLabel: 'অতিথি',
      referenceLabel: 'রেফারেন্স',
      closing: 'আপনার অপেক্ষায় রইলাম।',
    },
    pending: {
      subject: 'আপনার বুকিংয়ের অনুরোধ আমরা পেয়েছি',
      heading: 'বুকিংয়ের অনুরোধ পাঠানো হয়েছে',
      intro:
        'আপনার অনুরোধ আমরা জায়গাটির কাছে পৌঁছে দিয়েছি, তারা নিশ্চিত করলেই আবার লিখব। এখনো কিছুই বুক করা হয়নি।',
      whenLabel: 'অনুরোধের সময়',
      untilLabel: 'শেষ',
      partyLabel: 'অতিথি',
      referenceLabel: 'রেফারেন্স',
      closing: 'শিগগিরই যোগাযোগ করব।',
    },
  },
  ur: {
    confirmed: {
      subject: 'آپ کی بکنگ کنفرم ہو گئی ہے',
      heading: 'بکنگ کنفرم',
      intro: 'آپ کی میز بک ہو گئی ہے۔ کچھ بھی تبدیل کرنا ہو تو یہ ریفرنس بتائیں۔',
      whenLabel: 'کب',
      untilLabel: 'اختتام',
      partyLabel: 'افراد',
      referenceLabel: 'ریفرنس',
      closing: 'ہم آپ کے منتظر ہیں۔',
    },
    pending: {
      subject: 'ہمیں آپ کی بکنگ کی درخواست مل گئی ہے',
      heading: 'بکنگ کی درخواست بھیج دی گئی',
      intro:
        'ہم نے آپ کی درخواست مقام تک پہنچا دی ہے اور ان کی تصدیق ہوتے ہی دوبارہ لکھیں گے۔ ابھی کچھ بھی بک نہیں ہوا۔',
      whenLabel: 'درخواست کردہ وقت',
      untilLabel: 'اختتام',
      partyLabel: 'افراد',
      referenceLabel: 'ریفرنس',
      closing: 'ہم جلد رابطہ کریں گے۔',
    },
  },
}

/** Anything that is not a live booking is not something we write about. */
const copyFor = (status: BookingStatus, locale: Locale): Copy | null => {
  if (status === 'confirmed') return COPY[locale].confirmed
  if (status === 'pending') return COPY[locale].pending
  return null
}

/**
 * Who is speaking, when a reason is included.
 *
 * The sentence after this comes from the restaurant, not from us, and the reader
 * has to be able to tell. Without the attribution a blunt "we are fully booked"
 * reads as Vardenia's verdict on their evening, and a rude one would read as
 * ours. Kept beside the copy rather than in the messages file because this is
 * email, which has no `next-intl` around it.
 */
const REASON_LABEL: Record<Locale, string> = {
  en: 'The business said:',
  ar: 'قال المكان:',
  fr: "L'établissement a précisé :",
  es: 'El local dijo:',
  pt: 'O estabelecimento disse:',
  ru: 'Заведение сообщило:',
  zh: '商户留言：',
  hi: 'उस जगह ने कहा:',
  bn: 'জায়গাটি জানিয়েছে:',
  ur: 'مقام نے کہا:',
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface BookingEmailContent {
  subject: string
  html: string
  text: string
}

/**
 * Built as a pure function so the wording can be tested without sending
 * anything, and so a change to the copy is visible in a diff rather than
 * discovered in somebody's inbox.
 */
export function bookingConfirmationContent({
  name,
  reference,
  status,
  start,
  end,
  partySize,
  locale,
}: Omit<BookingConfirmationArgs, 'payload' | 'to'>): BookingEmailContent | null {
  const copy = copyFor(status, locale)
  if (!copy) return null

  return renderBookingEmail({ copy, name, reference, start, end, partySize, locale })
}

/**
 * One layout, several messages.
 *
 * Extracted when the status emails arrived, because the alternative was a second
 * copy of the same table markup - and two copies of an email template diverge
 * the first time somebody adjusts a padding value in one of them. Everything
 * that differs between messages is in `copy`.
 */
function renderBookingEmail({
  copy,
  name,
  reference,
  start,
  end,
  partySize,
  locale,
  reason,
}: {
  copy: Copy
  name: string
  reference: string
  start: Date
  end: Date
  partySize: number
  locale: Locale
  /** What the venue said, when they said anything. See `REASON_LABEL`. */
  reason?: string
}): BookingEmailContent {
  // From the language, not `=== 'ar'`: Urdu is right-to-left too, and an
  // Urdu email laid out left-to-right puts every label on the wrong side.
  const rtl = dirFor(locale) === 'rtl'
  const when = formatWhen(start, locale)
  const until = formatTime(end, locale)
  const said = (reason ?? '').trim()

  const rows: [string, string][] = [
    [copy.whenLabel, when],
    [copy.untilLabel, until],
    [copy.partyLabel, String(partySize)],
    [copy.referenceLabel, reference],
  ]

  const text = [
    `${copy.heading}`,
    '',
    `${name},`,
    '',
    copy.intro,
    ...(said ? ['', `${REASON_LABEL[locale]} ${said}`] : []),
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    copy.closing,
    'Vardenia',
  ].join('\n')

  const html = `<!doctype html>
<html lang="${locale}" dir="${rtl ? 'rtl' : 'ltr'}">
<body style="margin:0;padding:24px;background:${emailPalette.page};font-family:Georgia,'Times New Roman',serif;color:${emailPalette.strong};">
  <div style="max-width:520px;margin:0 auto;background:${emailPalette.card};border:1px solid ${emailPalette.edge};border-radius:8px;padding:32px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${emailPalette.accent};">Vardenia</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:normal;">${escapeHtml(copy.heading)}</h1>
    <p style="margin:0 0 8px;font-size:15px;">${escapeHtml(name)},</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${emailPalette.body};">${escapeHtml(copy.intro)}</p>
    ${
      said
        ? `<p style="margin:0 0 24px;padding:12px 16px;border-${rtl ? 'right' : 'left'}:3px solid ${emailPalette.edge};font-size:15px;line-height:1.6;color:${emailPalette.body};"><span style="color:${emailPalette.quiet};">${escapeHtml(REASON_LABEL[locale])}</span> ${escapeHtml(said)}</p>`
        : ''
    }
    <table style="width:100%;border-collapse:collapse;font-size:15px;">
      ${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:8px 0;color:${emailPalette.quiet};border-bottom:1px solid ${emailPalette.edge};">${escapeHtml(label)}</td><td style="padding:8px 0;text-align:${rtl ? 'left' : 'right'};border-bottom:1px solid ${emailPalette.edge};">${escapeHtml(value)}</td></tr>`,
        )
        .join('\n      ')}
    </table>
    <p style="margin:24px 0 0;font-size:15px;color:${emailPalette.body};">${escapeHtml(copy.closing)}</p>
  </div>
</body>
</html>`

  return { subject: copy.subject, html, text }
}

/**
 * Sends, or explains why it did not.
 *
 * Never throws at the caller. A booking that exists without a confirmation is a
 * problem for support; a booking that failed because an email provider had a bad
 * minute is a problem for the customer standing outside a restaurant.
 */
export async function sendBookingConfirmation({
  payload,
  to,
  ...rest
}: BookingConfirmationArgs): Promise<boolean> {
  const content = bookingConfirmationContent(rest)
  if (!content) return false

  try {
    await payload.sendEmail({
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    })
    return true
  } catch (error) {
    /**
     * Reported here rather than at the call site, because this function returns
     * `false` instead of rethrowing - so the caller's `.catch` never sees a send
     * failure and would have reported nothing at all.
     *
     * The reference is attached deliberately. It is what makes this recoverable:
     * somebody can look up the booking and write to the customer by hand.
     */
    await reportError(error, {
      source: 'booking.confirmation-email',
      extra: { reference: rest.reference },
    })
    return false
  }
}

// ---------------------------------------------------------------------------
// What we write when the business answers
// ---------------------------------------------------------------------------

/**
 * The outcomes worth an email, which is not the same as the statuses that exist.
 *
 *  - `confirmed`  the business accepted. The message the customer is waiting for.
 *  - `declined`   the business could not take the request. Never confirmed, so
 *                 nothing was ever reserved and the wording must not imply it was.
 *  - `cancelled`  a booking that *was* confirmed has been called off. Different
 *                 news, and worse, because they had planned around it.
 *
 * `completed` and `no-show` are deliberately absent. Telling somebody they
 * turned up is noise; telling them they did not is an accusation, and one we
 * would be making from a button a busy person pressed at the end of a shift.
 */
export type BookingOutcomeKind = 'confirmed' | 'declined' | 'cancelled'

const OUTCOME_COPY: Record<Locale, Record<BookingOutcomeKind, Copy>> = {
  en: {
    confirmed: {
      subject: 'Your booking is confirmed',
      heading: 'Booking confirmed',
      intro:
        'Good news - the business has confirmed your booking. Please quote this reference if you need to change anything.',
      whenLabel: 'When',
      untilLabel: 'Until',
      partyLabel: 'People',
      referenceLabel: 'Reference',
      closing: 'We look forward to seeing you.',
    },
    declined: {
      subject: 'Your booking request could not be taken',
      heading: 'Booking not available',
      intro:
        'The business was not able to take this booking, so nothing has been reserved. Another time may well be free, and other places nearby are on Vardenia.',
      whenLabel: 'You asked for',
      untilLabel: 'Until',
      partyLabel: 'People',
      referenceLabel: 'Reference',
      closing: 'Sorry to send disappointing news.',
    },
    cancelled: {
      subject: 'Your booking has been cancelled',
      heading: 'Booking cancelled',
      intro:
        'This booking has been cancelled and is no longer held. If that is unexpected, quote the reference below and we will look into it.',
      whenLabel: 'Was booked for',
      untilLabel: 'Until',
      partyLabel: 'People',
      referenceLabel: 'Reference',
      closing: 'Sorry for the change.',
    },
  },
  ar: {
    confirmed: {
      subject: 'تم تأكيد حجزك',
      heading: 'تم تأكيد الحجز',
      intro: 'خبر سار - أكّد المكان حجزك. يرجى ذكر هذا الرقم عند الحاجة إلى أي تعديل.',
      whenLabel: 'الموعد',
      untilLabel: 'حتى',
      partyLabel: 'عدد الأشخاص',
      referenceLabel: 'رقم الحجز',
      closing: 'نتطلع إلى استقبالك.',
    },
    declined: {
      subject: 'تعذّر قبول طلب حجزك',
      heading: 'الحجز غير متاح',
      intro:
        'لم يتمكن المكان من قبول هذا الحجز، ولم يتم حجز أي شيء. قد يكون موعد آخر متاحًا، وهناك أماكن أخرى قريبة على فاردينيا.',
      whenLabel: 'الموعد المطلوب',
      untilLabel: 'حتى',
      partyLabel: 'عدد الأشخاص',
      referenceLabel: 'رقم الحجز',
      closing: 'نأسف لهذا الخبر.',
    },
    cancelled: {
      subject: 'تم إلغاء حجزك',
      heading: 'تم إلغاء الحجز',
      intro:
        'تم إلغاء هذا الحجز ولم يعد محجوزًا. إذا كان ذلك غير متوقع، اذكر رقم الحجز أدناه وسنتحقق من الأمر.',
      whenLabel: 'كان محجوزًا في',
      untilLabel: 'حتى',
      partyLabel: 'عدد الأشخاص',
      referenceLabel: 'رقم الحجز',
      closing: 'نأسف لهذا التغيير.',
    },
  },
  fr: {
    confirmed: {
      subject: 'Votre réservation est confirmée',
      heading: 'Réservation confirmée',
      intro:
        "Bonne nouvelle : l'établissement a confirmé votre réservation. Indiquez cette référence si vous devez modifier quoi que ce soit.",
      whenLabel: 'Quand',
      untilLabel: "Jusqu'à",
      partyLabel: 'Personnes',
      referenceLabel: 'Référence',
      closing: 'Nous avons hâte de vous accueillir.',
    },
    declined: {
      subject: "Votre demande de réservation n'a pas pu être acceptée",
      heading: 'Réservation indisponible',
      intro:
        "L'établissement n'a pas pu accepter cette réservation, donc rien n'a été réservé. Un autre créneau est peut-être libre, et d'autres lieux à proximité sont sur Vardenia.",
      whenLabel: 'Vous aviez demandé',
      untilLabel: "Jusqu'à",
      partyLabel: 'Personnes',
      referenceLabel: 'Référence',
      closing: 'Désolés pour cette mauvaise nouvelle.',
    },
    cancelled: {
      subject: 'Votre réservation a été annulée',
      heading: 'Réservation annulée',
      intro:
        "Cette réservation a été annulée et n'est plus tenue. Si c'est inattendu, indiquez la référence ci-dessous et nous regarderons.",
      whenLabel: 'Était réservée pour',
      untilLabel: "Jusqu'à",
      partyLabel: 'Personnes',
      referenceLabel: 'Référence',
      closing: 'Désolés pour ce changement.',
    },
  },
  es: {
    confirmed: {
      subject: 'Tu reserva está confirmada',
      heading: 'Reserva confirmada',
      intro:
        '¡Buenas noticias! El local ha confirmado tu reserva. Indica esta referencia si necesitas cambiar algo.',
      whenLabel: 'Cuándo',
      untilLabel: 'Hasta',
      partyLabel: 'Personas',
      referenceLabel: 'Referencia',
      closing: 'Te esperamos con ganas.',
    },
    declined: {
      subject: 'No se pudo aceptar tu solicitud de reserva',
      heading: 'Reserva no disponible',
      intro:
        'El local no ha podido aceptar esta reserva, así que no se ha reservado nada. Puede que otro horario esté libre, y hay otros lugares cerca en Vardenia.',
      whenLabel: 'Habías pedido',
      untilLabel: 'Hasta',
      partyLabel: 'Personas',
      referenceLabel: 'Referencia',
      closing: 'Lamentamos darte una mala noticia.',
    },
    cancelled: {
      subject: 'Tu reserva ha sido cancelada',
      heading: 'Reserva cancelada',
      intro:
        'Esta reserva se ha cancelado y ya no está guardada. Si no te lo esperabas, indica la referencia de abajo y lo revisaremos.',
      whenLabel: 'Estaba reservada para',
      untilLabel: 'Hasta',
      partyLabel: 'Personas',
      referenceLabel: 'Referencia',
      closing: 'Lamentamos el cambio.',
    },
  },
  pt: {
    confirmed: {
      subject: 'Sua reserva está confirmada',
      heading: 'Reserva confirmada',
      intro:
        'Boa notícia: o estabelecimento confirmou sua reserva. Informe esta referência se precisar mudar alguma coisa.',
      whenLabel: 'Quando',
      untilLabel: 'Até',
      partyLabel: 'Pessoas',
      referenceLabel: 'Referência',
      closing: 'Esperamos por você.',
    },
    declined: {
      subject: 'Não foi possível aceitar seu pedido de reserva',
      heading: 'Reserva indisponível',
      intro:
        'O estabelecimento não pôde aceitar esta reserva, então nada foi reservado. Outro horário pode estar livre, e há outros lugares por perto na Vardenia.',
      whenLabel: 'Você pediu',
      untilLabel: 'Até',
      partyLabel: 'Pessoas',
      referenceLabel: 'Referência',
      closing: 'Sentimos pela má notícia.',
    },
    cancelled: {
      subject: 'Sua reserva foi cancelada',
      heading: 'Reserva cancelada',
      intro:
        'Esta reserva foi cancelada e não está mais garantida. Se isso foi inesperado, informe a referência abaixo e vamos verificar.',
      whenLabel: 'Estava reservada para',
      untilLabel: 'Até',
      partyLabel: 'Pessoas',
      referenceLabel: 'Referência',
      closing: 'Sentimos pela mudança.',
    },
  },
  ru: {
    confirmed: {
      subject: 'Ваше бронирование подтверждено',
      heading: 'Бронирование подтверждено',
      intro:
        'Хорошие новости: заведение подтвердило ваше бронирование. Если нужно что-то изменить, укажите этот номер.',
      whenLabel: 'Когда',
      untilLabel: 'До',
      partyLabel: 'Гостей',
      referenceLabel: 'Номер брони',
      closing: 'Будем рады вас видеть.',
    },
    declined: {
      subject: 'Ваш запрос на бронирование не принят',
      heading: 'Бронирование недоступно',
      intro:
        'Заведение не смогло принять это бронирование, поэтому ничего не забронировано. Возможно, свободно другое время, а другие места поблизости есть на Vardenia.',
      whenLabel: 'Вы просили',
      untilLabel: 'До',
      partyLabel: 'Гостей',
      referenceLabel: 'Номер брони',
      closing: 'Жаль, что пишем с плохими новостями.',
    },
    cancelled: {
      subject: 'Ваше бронирование отменено',
      heading: 'Бронирование отменено',
      intro:
        'Это бронирование отменено и больше не действует. Если это неожиданно, укажите номер ниже, и мы разберёмся.',
      whenLabel: 'Было забронировано на',
      untilLabel: 'До',
      partyLabel: 'Гостей',
      referenceLabel: 'Номер брони',
      closing: 'Сожалеем об изменении.',
    },
  },
  zh: {
    confirmed: {
      subject: '您的预订已确认',
      heading: '预订已确认',
      intro: '好消息：商户已确认您的预订。如需更改，请提供此预订编号。',
      whenLabel: '时间',
      untilLabel: '结束',
      partyLabel: '人数',
      referenceLabel: '预订编号',
      closing: '期待您的光临。',
    },
    declined: {
      subject: '您的预订请求未能被接受',
      heading: '无法预订',
      intro:
        '商户未能接受此次预订，因此没有为您预留任何餐位。其他时段可能还有空位，Vardenia 上也有附近的其他地点。',
      whenLabel: '您请求的时间',
      untilLabel: '结束',
      partyLabel: '人数',
      referenceLabel: '预订编号',
      closing: '很抱歉带来这个消息。',
    },
    cancelled: {
      subject: '您的预订已取消',
      heading: '预订已取消',
      intro:
        '此预订已被取消，不再为您保留。如果这出乎您的意料，请提供下方的预订编号，我们会查明情况。',
      whenLabel: '原预订时间',
      untilLabel: '结束',
      partyLabel: '人数',
      referenceLabel: '预订编号',
      closing: '很抱歉有此变动。',
    },
  },
  hi: {
    confirmed: {
      subject: 'आपकी बुकिंग पक्की हो गई है',
      heading: 'बुकिंग पक्की',
      intro:
        'अच्छी ख़बर: उस जगह ने आपकी बुकिंग पक्की कर दी है। कुछ भी बदलना हो तो यह रेफ़रेंस नंबर बताएँ।',
      whenLabel: 'कब',
      untilLabel: 'समाप्ति',
      partyLabel: 'मेहमान',
      referenceLabel: 'रेफ़रेंस',
      closing: 'आपका इंतज़ार रहेगा।',
    },
    declined: {
      subject: 'आपका बुकिंग अनुरोध स्वीकार नहीं हो सका',
      heading: 'बुकिंग उपलब्ध नहीं',
      intro:
        'वह जगह यह बुकिंग नहीं ले सकी, इसलिए कुछ भी बुक नहीं हुआ है। हो सकता है कोई दूसरा समय ख़ाली हो, और आसपास की दूसरी जगहें Vardenia पर हैं।',
      whenLabel: 'आपने माँगा था',
      untilLabel: 'समाप्ति',
      partyLabel: 'मेहमान',
      referenceLabel: 'रेफ़रेंस',
      closing: 'निराशाजनक ख़बर के लिए माफ़ी चाहते हैं।',
    },
    cancelled: {
      subject: 'आपकी बुकिंग रद्द कर दी गई है',
      heading: 'बुकिंग रद्द',
      intro:
        'यह बुकिंग रद्द कर दी गई है और अब आपके लिए रखी नहीं गई है। अगर यह अप्रत्याशित है, तो नीचे दिया रेफ़रेंस बताएँ और हम इसकी जाँच करेंगे।',
      whenLabel: 'बुकिंग का समय था',
      untilLabel: 'समाप्ति',
      partyLabel: 'मेहमान',
      referenceLabel: 'रेफ़रेंस',
      closing: 'इस बदलाव के लिए माफ़ी चाहते हैं।',
    },
  },
  bn: {
    confirmed: {
      subject: 'আপনার বুকিং নিশ্চিত হয়েছে',
      heading: 'বুকিং নিশ্চিত',
      intro:
        'সুখবর: জায়গাটি আপনার বুকিং নিশ্চিত করেছে। কিছু পরিবর্তন করতে চাইলে এই রেফারেন্সটি উল্লেখ করুন।',
      whenLabel: 'কখন',
      untilLabel: 'শেষ',
      partyLabel: 'অতিথি',
      referenceLabel: 'রেফারেন্স',
      closing: 'আপনার অপেক্ষায় রইলাম।',
    },
    declined: {
      subject: 'আপনার বুকিংয়ের অনুরোধ গ্রহণ করা যায়নি',
      heading: 'বুকিং পাওয়া যায়নি',
      intro:
        'জায়গাটি এই বুকিং নিতে পারেনি, তাই কিছুই বুক করা হয়নি। অন্য কোনো সময় হয়তো খালি আছে, আর কাছাকাছি অন্য জায়গাগুলো Vardenia-তে আছে।',
      whenLabel: 'আপনি চেয়েছিলেন',
      untilLabel: 'শেষ',
      partyLabel: 'অতিথি',
      referenceLabel: 'রেফারেন্স',
      closing: 'হতাশাজনক খবরের জন্য দুঃখিত।',
    },
    cancelled: {
      subject: 'আপনার বুকিং বাতিল করা হয়েছে',
      heading: 'বুকিং বাতিল',
      intro:
        'এই বুকিংটি বাতিল করা হয়েছে এবং আর রাখা নেই। এটি অপ্রত্যাশিত হলে নিচের রেফারেন্সটি উল্লেখ করুন, আমরা খতিয়ে দেখব।',
      whenLabel: 'বুক করা ছিল',
      untilLabel: 'শেষ',
      partyLabel: 'অতিথি',
      referenceLabel: 'রেফারেন্স',
      closing: 'এই পরিবর্তনের জন্য দুঃখিত।',
    },
  },
  ur: {
    confirmed: {
      subject: 'آپ کی بکنگ کنفرم ہو گئی ہے',
      heading: 'بکنگ کنفرم',
      intro:
        'خوش خبری: مقام نے آپ کی بکنگ کنفرم کر دی ہے۔ کچھ بھی تبدیل کرنا ہو تو یہ ریفرنس بتائیں۔',
      whenLabel: 'کب',
      untilLabel: 'اختتام',
      partyLabel: 'افراد',
      referenceLabel: 'ریفرنس',
      closing: 'ہم آپ کے منتظر ہیں۔',
    },
    declined: {
      subject: 'آپ کی بکنگ کی درخواست قبول نہیں ہو سکی',
      heading: 'بکنگ دستیاب نہیں',
      intro:
        'مقام یہ بکنگ قبول نہیں کر سکا، اس لیے کچھ بھی بک نہیں ہوا۔ ممکن ہے کوئی اور وقت خالی ہو، اور آس پاس کے دوسرے مقامات Vardenia پر موجود ہیں۔',
      whenLabel: 'آپ نے مانگا تھا',
      untilLabel: 'اختتام',
      partyLabel: 'افراد',
      referenceLabel: 'ریفرنس',
      closing: 'مایوس کن خبر کے لیے معذرت۔',
    },
    cancelled: {
      subject: 'آپ کی بکنگ منسوخ کر دی گئی ہے',
      heading: 'بکنگ منسوخ',
      intro:
        'یہ بکنگ منسوخ کر دی گئی ہے اور اب آپ کے لیے محفوظ نہیں۔ اگر یہ غیر متوقع ہے تو نیچے دیا گیا ریفرنس بتائیں، ہم اس کی جانچ کریں گے۔',
      whenLabel: 'بکنگ کا وقت تھا',
      untilLabel: 'اختتام',
      partyLabel: 'افراد',
      referenceLabel: 'ریفرنس',
      closing: 'اس تبدیلی کے لیے معذرت۔',
    },
  },
}

/**
 * Which outcome, if any, a status change should be written about.
 *
 * Takes both statuses because `cancelled` means two different things depending
 * on where it came from: from `pending` the business declined a request that was
 * never held, and from `confirmed` it called off something the customer had
 * planned around. Sending the same sentence for both would tell one of them
 * something untrue.
 */
export function outcomeFor(from: BookingStatus, to: BookingStatus): BookingOutcomeKind | null {
  if (from === to) return null
  if (to === 'confirmed') return 'confirmed'
  if (to === 'cancelled') return from === 'pending' ? 'declined' : 'cancelled'
  return null
}

export interface BookingOutcomeArgs {
  payload: Payload
  to: string
  name: string
  reference: string
  outcome: BookingOutcomeKind
  start: Date
  end: Date
  partySize: number
  locale: Locale
  /**
   * What the venue said, when they wrote anything. Optional and usually absent:
   * a restaurant answering thirty requests at the end of a shift is not going to
   * explain each one, and the message has to read properly without it.
   */
  reason?: string
}

/** Pure, like the confirmation content, so the wording is testable. */
export function bookingOutcomeContent({
  name,
  reference,
  outcome,
  start,
  end,
  partySize,
  locale,
  reason,
}: Omit<BookingOutcomeArgs, 'payload' | 'to'>): BookingEmailContent {
  const copy = OUTCOME_COPY[locale][outcome]
  return renderBookingEmail({
    copy,
    name,
    reference,
    start,
    end,
    partySize,
    locale,
    /**
     * Only on the bad news. `confirmed` carries no reason today, and if a venue
     * ever leaves one on a booking they then accept, "the business said: we are
     * fully booked" underneath "Booking confirmed" would be a contradiction we
     * printed ourselves.
     */
    reason: outcome === 'confirmed' ? undefined : reason,
  })
}

/**
 * Sends, and never throws at the caller.
 *
 * Called from an `afterChange` hook, so the booking has already been written by
 * the time this runs. Letting a mail failure escape would turn a successful
 * confirmation into a 500 for the owner who pressed Accept, and leave them
 * pressing it again against a booking that is already confirmed.
 */
export async function sendBookingOutcome({
  payload,
  to,
  ...rest
}: BookingOutcomeArgs): Promise<boolean> {
  const content = bookingOutcomeContent(rest)

  try {
    await payload.sendEmail({
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    })
    return true
  } catch (error) {
    await reportError(error, {
      source: 'booking.outcome-email',
      extra: { reference: rest.reference, outcome: rest.outcome },
    })
    return false
  }
}

// ---------------------------------------------------------------------------
// What we write to the venue
// ---------------------------------------------------------------------------

/**
 * Tells a business that a booking it was holding has been called off.
 *
 * The first message this product ever sends a partner, and it exists because the
 * dashboard alone does not solve the problem. A venue does not sit refreshing a
 * page; without this a table stays held for somebody who decided last week not
 * to come, and the venue finds out when the evening is over. That is the part of
 * a cancellation that actually costs money.
 *
 * # Both languages, like the partner password email
 *
 * The booking carries the *customer's* language, which says nothing about the
 * person who runs the restaurant. We have never asked a partner what they read,
 * so both go in one message rather than one being guessed.
 */
export interface VenueCancellationArgs {
  payload: Payload
  to: string
  businessName: string
  guestName: string
  reference: string
  start: Date
  partySize: number
  /** True when the booking had been confirmed, so the table was genuinely held. */
  wasConfirmed: boolean
}

export function venueCancellationContent({
  businessName,
  guestName,
  reference,
  start,
  partySize,
  wasConfirmed,
}: Omit<VenueCancellationArgs, 'payload' | 'to'>): BookingEmailContent {
  const whenEn = formatWhen(start, 'en')
  const whenAr = formatWhen(start, 'ar')

  /**
   * A confirmed booking freed a table; a pending one was only ever a request.
   * Saying "a table is now free" about something the venue never accepted would
   * be telling them about a table they did not know they had lost.
   */
  const leadEn = wasConfirmed
    ? `A confirmed booking at ${businessName} has been cancelled, so that table is free again.`
    : `A booking request at ${businessName} has been withdrawn. There is nothing to answer.`

  const leadAr = wasConfirmed
    ? `تم إلغاء حجز مؤكّد في ${businessName}، والطاولة متاحة الآن.`
    : `تم سحب طلب حجز في ${businessName}. لا حاجة للرد عليه.`

  const subject = wasConfirmed
    ? `Booking cancelled - ${reference}`
    : `Booking request withdrawn - ${reference}`

  const rows: [string, string][] = [
    ['Guest', guestName || 'Guest'],
    ['When', whenEn],
    ['People', String(partySize)],
    ['Reference', reference],
  ]

  const text = [
    leadEn,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `Your bookings: ${siteOrigin()}/partner`,
    '',
    '---',
    '',
    leadAr,
    '',
    `${whenAr} - ${partySize}`,
    reference,
    '',
    `حجوزاتك: ${siteOrigin()}/partner`,
    '',
    'Vardenia',
  ].join('\n')

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:${emailPalette.page};font-family:Georgia,'Times New Roman',serif;color:${emailPalette.strong};">
  <div style="max-width:520px;margin:0 auto;background:${emailPalette.card};border:1px solid ${emailPalette.edge};border-radius:8px;padding:32px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${emailPalette.accent};">Vardenia</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:normal;">${escapeHtml(wasConfirmed ? 'Booking cancelled' : 'Request withdrawn')}</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${emailPalette.body};">${escapeHtml(leadEn)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px;">
      ${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:8px 0;color:${emailPalette.quiet};border-bottom:1px solid ${emailPalette.edge};">${escapeHtml(label)}</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid ${emailPalette.edge};">${escapeHtml(value)}</td></tr>`,
        )
        .join('\n      ')}
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:${emailPalette.quiet};">
      <a href="${escapeHtml(siteOrigin())}/partner" style="color:${emailPalette.accent};">${escapeHtml(siteOrigin())}/partner</a>
    </p>
    <div dir="rtl" lang="ar" style="margin-top:24px;border-top:1px solid ${emailPalette.edge};padding-top:24px;text-align:right;font-family:'Segoe UI',Tahoma,sans-serif;">
      <p style="margin:0;font-size:15px;line-height:1.8;color:${emailPalette.body};">${escapeHtml(leadAr)}</p>
    </div>
  </div>
</body>
</html>`

  return { subject, html, text }
}

/** Sends, and never throws - it runs from a hook after the write. */
export async function sendVenueCancellation({
  payload,
  to,
  ...rest
}: VenueCancellationArgs): Promise<boolean> {
  const content = venueCancellationContent(rest)

  try {
    await payload.sendEmail({
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    })
    return true
  } catch (error) {
    await reportError(error, {
      source: 'booking.venue-cancellation',
      extra: { reference: rest.reference },
    })
    return false
  }
}
