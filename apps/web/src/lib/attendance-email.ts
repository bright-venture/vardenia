import { dirFor, type Locale } from '@vardenia/i18n'
import { formatWhen } from './booking-email'
import { emailPalette } from './email-palette'

/**
 * "Did you go?" - the email a guest gets a couple of hours after a visit.
 *
 * Two buttons, and each opens a page that asks the guest to press once more.
 * The links do not answer by themselves on purpose: mail scanners open every
 * link in a message to check it, and a link that recorded "I came" on being
 * opened would be answered by a security filter before the guest saw it.
 *
 * Every UI language, like the booking emails. Pure, so the wording is tested.
 */

interface AttendanceCopy {
  subject: (place: string) => string
  heading: string
  intro: (place: string, when: string) => string
  yes: string
  no: string
  why: string
  closing: string
}

const COPY: Record<Locale, AttendanceCopy> = {
  en: {
    subject: (place) => `Did you go to ${place}?`,
    heading: 'Did you go?',
    intro: (place, when) => `You booked ${place} for ${when}. Did you go?`,
    yes: 'Yes, I went',
    no: 'No, I did not go',
    why: 'Your answer adds the stamp to your Vardenia passport, and helps us keep every place honest. It takes one click.',
    closing: 'Thank you.',
  },
  ar: {
    subject: (place) => `هل ذهبت إلى ${place}؟`,
    heading: 'هل ذهبت؟',
    intro: (place, when) => `حجزت في ${place} بتاريخ ${when}. هل ذهبت؟`,
    yes: 'نعم، ذهبت',
    no: 'لا، لم أذهب',
    why: 'جوابك يضيف الختم إلى جواز فاردينيا الخاص بك، ويساعدنا على إبقاء كل مكان صادقًا. يكفي نقرة واحدة.',
    closing: 'شكرًا لك.',
  },
  fr: {
    subject: (place) => `Êtes-vous allé à ${place} ?`,
    heading: 'Y êtes-vous allé ?',
    intro: (place, when) => `Vous aviez réservé ${place} pour ${when}. Y êtes-vous allé ?`,
    yes: "Oui, j'y suis allé",
    no: "Non, je n'y suis pas allé",
    why: 'Votre réponse ajoute le tampon à votre passeport Vardenia et nous aide à garder chaque adresse honnête. Un seul clic suffit.',
    closing: 'Merci.',
  },
  es: {
    subject: (place) => `¿Fuiste a ${place}?`,
    heading: '¿Fuiste?',
    intro: (place, when) => `Reservaste en ${place} para el ${when}. ¿Fuiste?`,
    yes: 'Sí, fui',
    no: 'No, no fui',
    why: 'Tu respuesta añade el sello a tu pasaporte Vardenia y nos ayuda a que cada lugar sea honesto. Basta un clic.',
    closing: 'Gracias.',
  },
  pt: {
    subject: (place) => `Você foi a ${place}?`,
    heading: 'Você foi?',
    intro: (place, when) => `Você reservou ${place} para ${when}. Você foi?`,
    yes: 'Sim, fui',
    no: 'Não, não fui',
    why: 'A sua resposta acrescenta o carimbo ao seu passaporte Vardenia e ajuda-nos a manter cada lugar honesto. Basta um clique.',
    closing: 'Obrigado.',
  },
  ru: {
    subject: (place) => `Вы были в ${place}?`,
    heading: 'Вы были там?',
    intro: (place, when) => `Вы бронировали ${place} на ${when}. Вы там были?`,
    yes: 'Да, я был',
    no: 'Нет, я не был',
    why: 'Ваш ответ добавит штамп в ваш паспорт Vardenia и поможет нам сохранять честность каждого места. Достаточно одного нажатия.',
    closing: 'Спасибо.',
  },
  zh: {
    subject: (place) => `您去了${place}吗？`,
    heading: '您去了吗？',
    intro: (place, when) => `您预订了${place}，时间为${when}。您去了吗？`,
    yes: '是的，我去了',
    no: '没有，我没去',
    why: '您的回答会为您的 Vardenia 护照加盖印章，也帮助我们确保每个地方诚实可信。只需点击一次。',
    closing: '谢谢。',
  },
  hi: {
    subject: (place) => `क्या आप ${place} गए थे?`,
    heading: 'क्या आप गए थे?',
    intro: (place, when) => `आपने ${place} में ${when} के लिए बुकिंग की थी। क्या आप गए थे?`,
    yes: 'हाँ, मैं गया था',
    no: 'नहीं, मैं नहीं गया',
    why: 'आपका जवाब आपके Vardenia पासपोर्ट में मुहर जोड़ता है और हर जगह को ईमानदार रखने में हमारी मदद करता है। बस एक क्लिक।',
    closing: 'धन्यवाद।',
  },
  bn: {
    subject: (place) => `আপনি কি ${place}-এ গিয়েছিলেন?`,
    heading: 'আপনি কি গিয়েছিলেন?',
    intro: (place, when) => `আপনি ${place}-এ ${when} সময়ের জন্য বুক করেছিলেন। আপনি কি গিয়েছিলেন?`,
    yes: 'হ্যাঁ, গিয়েছিলাম',
    no: 'না, যাইনি',
    why: 'আপনার উত্তর আপনার Vardenia পাসপোর্টে স্ট্যাম্প যোগ করে এবং প্রতিটি জায়গাকে সৎ রাখতে আমাদের সাহায্য করে। একটি ক্লিকই যথেষ্ট।',
    closing: 'ধন্যবাদ।',
  },
  ur: {
    subject: (place) => `کیا آپ ${place} گئے تھے؟`,
    heading: 'کیا آپ گئے تھے؟',
    intro: (place, when) => `آپ نے ${place} میں ${when} کے لیے بکنگ کی تھی۔ کیا آپ گئے تھے؟`,
    yes: 'ہاں، میں گیا تھا',
    no: 'نہیں، میں نہیں گیا',
    why: 'آپ کا جواب آپ کے Vardenia پاسپورٹ میں مہر لگاتا ہے اور ہر جگہ کو دیانت دار رکھنے میں ہماری مدد کرتا ہے۔ بس ایک کلک۔',
    closing: 'شکریہ۔',
  },
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface AttendanceEmailArgs {
  name: string
  place: string
  start: Date
  locale: Locale
  /** The page for each answer; see visitPageUrl in lib/attendance. */
  yesUrl: string
  noUrl: string
}

export function attendanceEmailContent({
  name,
  place,
  start,
  locale,
  yesUrl,
  noUrl,
}: AttendanceEmailArgs): { subject: string; html: string; text: string } {
  const copy = COPY[locale] ?? COPY.en
  const rtl = dirFor(locale) === 'rtl'
  const when = formatWhen(start, locale)
  const intro = copy.intro(place, when)

  const text = [
    copy.heading,
    '',
    `${name},`,
    '',
    intro,
    '',
    `${copy.yes}: ${yesUrl}`,
    `${copy.no}: ${noUrl}`,
    '',
    copy.why,
    '',
    copy.closing,
    'Vardenia',
  ].join('\n')

  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:15px;${
      primary
        ? `background:${emailPalette.strong};color:${emailPalette.card};`
        : `background:${emailPalette.card};color:${emailPalette.strong};border:1px solid ${emailPalette.edge};`
    }">${escapeHtml(label)}</a>`

  const html = `<!doctype html>
<html lang="${locale}" dir="${rtl ? 'rtl' : 'ltr'}">
<body style="margin:0;padding:24px;background:${emailPalette.page};font-family:Georgia,'Times New Roman',serif;color:${emailPalette.strong};">
  <div style="max-width:520px;margin:0 auto;background:${emailPalette.card};border:1px solid ${emailPalette.edge};border-radius:8px;padding:32px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${emailPalette.accent};">Vardenia</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:normal;">${escapeHtml(copy.heading)}</h1>
    <p style="margin:0 0 8px;font-size:15px;">${escapeHtml(name)},</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${emailPalette.body};">${escapeHtml(intro)}</p>
    <p style="margin:0 0 16px;">${button(yesUrl, copy.yes, true)}${button(noUrl, copy.no, false)}</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${emailPalette.body};">${escapeHtml(copy.why)}</p>
    <p style="margin:0;font-size:15px;color:${emailPalette.body};">${escapeHtml(copy.closing)}</p>
  </div>
</body>
</html>`

  return { subject: copy.subject(place), html, text }
}
