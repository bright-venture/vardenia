import { dirFor } from '@vardenia/i18n'

import { formatMoney } from './place-payment-rules'
import type { PaymentEvent } from './place-payment-notify'
import {
  emailLayout,
  emailText,
  oneLine,
  type PlaceSubmissionEmail,
} from './place-submission-email'

/**
 * The payment emails of the Magazine Places form (spec v4, Task 10): pure
 * builders, so the wording, the escaping and the WhatsApp link can be tested
 * without sending anything. lib/place-payment-notify reads the business and
 * sends them.
 *
 * English and Arabic; any other language gets English, left to right. Every
 * owner email carries the reference (VD-n), the page number, the amounts and
 * the deadline that matters; the ones that ask for money also carry the
 * company's Whish number and a WhatsApp link for owners who paid from another
 * phone. That link holds the business name, the reference and "I paid from"
 * for the owner to finish: never the owner's own phone or email.
 *
 * All text goes through the shared layout (lib/place-submission-email), which
 * escapes every string.
 */

export type EmailLocale = 'en' | 'ar'

export interface PaymentEmailFacts {
  locale: EmailLocale
  ownerName: string
  businessName: string
  /** VD-<n>. */
  reference: string
  /** The page number, or null when there is none to show. */
  pageNumber: number | null
  price: number
  downpaymentAmount: number
  /** Downpayment and rest received (undone lines not counted). */
  received: number
  refunded: number
  stillToPay: number
  currency: string
  downpaymentDueAt: string | null
  balanceDueAt: string | null
  /** Days to pay the rest once accepted (the submission's copy, else Settings). */
  balanceDeadlineDays: number
  /** E8: when the listing's year ends. */
  contractEndsAt?: string | null
  /** E5: the reason staff chose to share, already checked. */
  sharedReason?: string | null
  /** Company number for Whish and WhatsApp (Settings). */
  whishNumber: string
  /** siteOrigin() */
  origin: string
  /** E6 team copy: the listing's id for the admin link. */
  businessId?: number
  /** When the email is written (ISO); E6 says "the deadline was" only once it has passed. */
  now?: string
}

/** A date as the owner reads it, in Lebanon's time zone. */
export function emailDate(iso: string | null | undefined, locale: EmailLocale): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Beirut',
  })
}

/**
 * https://wa.me/<company digits>?text=<business, reference, "I paid from">.
 * The owner types the number they paid from; nothing about the owner is in it.
 */
export function whatsappLink(args: {
  whishNumber: string
  businessName: string
  reference: string
  locale: EmailLocale
}): string {
  const digits = args.whishNumber.replace(/\D/g, '')
  const paidFrom = args.locale === 'ar' ? 'دفعت من الرقم:' : 'I paid from:'
  const text = `${oneLine(args.businessName)} - ${args.reference} - ${paidFrom} `
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

const amount = (n: number, currency: string) => formatMoney(n, currency)

/** Arabic count of days, with the noun the number takes. */
function arabicDays(n: number): string {
  switch (new Intl.PluralRules('ar').select(n)) {
    case 'one':
      return 'يوم واحد'
    case 'two':
      return 'يومين'
    case 'few':
      return `${n} أيام`
    case 'many':
      return `${n} يومًا`
    default:
      return `${n} يوم`
  }
}

/**
 * "within 1 month (30 days)", "within 2 months (60 days)" or "within 45 days",
 * from the Settings days (in Arabic: "خلال شهر واحد (30 يومًا)").
 */
export function withinDays(days: number, locale: EmailLocale): string {
  const months = days > 0 && days % 30 === 0 ? days / 30 : 0
  if (locale === 'ar') {
    const month = months === 1 ? 'شهر واحد' : months === 2 ? 'شهرين' : `${months} أشهر`
    return months > 0 && months <= 10
      ? `خلال ${month} (${arabicDays(days)})`
      : `خلال ${arabicDays(days)}`
  }
  if (months > 0) return `within ${months} month${months === 1 ? '' : 's'} (${days} days)`
  return `within ${days} day${days === 1 ? '' : 's'}`
}

/** E6 by the job: the deadline has come. Staff may also reject earlier, by hand. */
const balanceDeadlinePassed = (f: PaymentEmailFacts) => {
  const due = f.balanceDueAt ? new Date(f.balanceDueAt).getTime() : Number.NaN
  const now = f.now ? new Date(f.now).getTime() : Date.now()
  return Number.isFinite(due) && now >= due
}

const toReturn = (f: PaymentEmailFacts) => Math.max(0, f.received - f.refunded)

interface Body {
  heading: string
  paragraphs: string[]
  rows: [string, string][]
  link?: { href: string; label: string }
}

type Labels = Record<
  | 'reference'
  | 'page'
  | 'released'
  | 'price'
  | 'downpayment'
  | 'received'
  | 'stillToPay'
  | 'payNow'
  | 'payBy'
  | 'whish'
  | 'toReturn'
  | 'endsOn'
  | 'whatsapp'
  | 'apply',
  string
>

const LABELS: Record<EmailLocale, Labels> = {
  en: {
    reference: 'Reference',
    page: 'Page number',
    released: 'released',
    price: 'Price for one year',
    downpayment: 'Downpayment',
    received: 'Received',
    stillToPay: 'Still to pay',
    payNow: 'To pay now',
    payBy: 'Pay by',
    whish: 'Whish number',
    toReturn: 'To be returned',
    endsOn: 'Listed until',
    whatsapp: 'Paid from another number? Tell us on WhatsApp',
    apply: 'Submit a new form',
  },
  ar: {
    reference: 'المرجع',
    page: 'رقم الصفحة',
    released: 'تم تحريره',
    price: 'السعر لسنة واحدة',
    downpayment: 'الدفعة الأولى',
    received: 'المبلغ المستلم',
    stillToPay: 'المتبقي للدفع',
    payNow: 'المطلوب دفعه الآن',
    payBy: 'آخر موعد للدفع',
    whish: 'رقم Whish',
    toReturn: 'المبلغ الذي سيُعاد',
    endsOn: 'مُدرج حتى',
    whatsapp: 'دفعت من رقم آخر؟ أخبرنا على واتساب',
    apply: 'أرسل نموذجاً جديداً',
  },
}

const CLOSING: Record<EmailLocale, string> = {
  en: 'The Vardenia team',
  ar: 'فريق فارديينيا',
}

const hello = (name: string, locale: EmailLocale) => (locale === 'ar' ? `${name}،` : `${name},`)

function pageRow(f: PaymentEmailFacts, l: Labels, released = false): [string, string][] {
  if (f.pageNumber === null) return []
  return [[l.page, released ? `${f.pageNumber} (${l.released})` : String(f.pageNumber)]]
}

const applyLink = (f: PaymentEmailFacts, l: Labels) => ({
  // English is the unprefixed address (localePrefix: as-needed).
  href: `${f.origin}${f.locale === 'ar' ? '/ar' : ''}/magazine-places`,
  label: l.apply,
})

const waLink = (f: PaymentEmailFacts, l: Labels) => ({
  href: whatsappLink({
    whishNumber: f.whishNumber,
    businessName: f.businessName,
    reference: f.reference,
    locale: f.locale,
  }),
  label: l.whatsapp,
})

type Copy = (f: PaymentEmailFacts) => { subject: string } & Body

const EN: Record<PaymentEvent, Copy> = {
  E1: (f) => {
    const l = LABELS.en
    const due = emailDate(f.downpaymentDueAt, 'en')
    const rest = amount(f.price - f.downpaymentAmount, f.currency)
    return {
      subject: `Pay the downpayment for ${oneLine(f.businessName)}`,
      heading: 'Your form is in: pay the downpayment',
      paragraphs: [
        hello(f.ownerName, 'en'),
        `Thank you for sending ${f.businessName} to Vardenia.${f.pageNumber !== null ? ` Page number ${f.pageNumber} is reserved for you.` : ''}`,
        `To keep it, pay the downpayment of ${amount(f.downpaymentAmount, f.currency)} by Whish to ${f.whishNumber} before ${due}, from the phone number you gave in the form. Write your reference ${f.reference} in the Whish note if you can.`,
        'Paying from another number? Tell us on WhatsApp which number you paid from, so we can find your payment.',
        `Once the downpayment is received, we review your business. If we accept it, you pay the rest (${rest}) ${withinDays(f.balanceDeadlineDays, 'en')} of acceptance. If we do not accept it, we return your downpayment by Whish to the number it was paid from.`,
        `If the downpayment is not received by ${due}, the page number is released.`,
        CLOSING.en,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l),
        [l.price, amount(f.price, f.currency)],
        [l.downpayment, amount(f.downpaymentAmount, f.currency)],
        [l.payBy, due],
        [l.whish, f.whishNumber],
      ],
      link: waLink(f, l),
    }
  },
  E1c: (f) => {
    const l = LABELS.en
    const due = emailDate(f.downpaymentDueAt, 'en')
    return {
      subject: `Reminder: the downpayment for ${oneLine(f.businessName)}`,
      heading: 'A reminder about your downpayment',
      paragraphs: [
        hello(f.ownerName, 'en'),
        `We have not received the downpayment of ${amount(f.downpaymentAmount, f.currency)} for ${f.businessName} yet. Pay it by Whish to ${f.whishNumber} before ${due}, or the page number will be released.`,
        'Already paid? Thank you. If you paid from another number, tell us on WhatsApp which one, so we can find your payment.',
        CLOSING.en,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l),
        [l.downpayment, amount(f.downpaymentAmount, f.currency)],
        [l.payBy, due],
        [l.whish, f.whishNumber],
      ],
      link: waLink(f, l),
    }
  },
  E2: (f) => {
    const l = LABELS.en
    return {
      subject: 'We received your downpayment',
      heading: 'Downpayment received',
      paragraphs: [
        hello(f.ownerName, 'en'),
        `We received your downpayment of ${amount(f.received, f.currency)} for ${f.businessName}. Thank you.`,
        'We are now reviewing your business and will get back to you. If we accept it, we will tell you how to pay the rest.',
        CLOSING.en,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l),
        [l.price, amount(f.price, f.currency)],
        [l.received, amount(f.received, f.currency)],
        [l.stillToPay, amount(f.stillToPay, f.currency)],
      ],
    }
  },
  E3: (f) => {
    const l = LABELS.en
    const due = emailDate(f.balanceDueAt, 'en')
    return {
      subject: `${oneLine(f.businessName)} is accepted: pay the rest`,
      heading: 'Your business is accepted',
      paragraphs: [
        hello(f.ownerName, 'en'),
        `Good news: we accepted ${f.businessName} for Vardenia.`,
        `Pay the rest, ${amount(f.stillToPay, f.currency)}, by Whish to ${f.whishNumber} ${withinDays(f.balanceDeadlineDays, 'en')}, before ${due}. Write your reference ${f.reference} in the Whish note if you can.`,
        'Paying from another number? Tell us on WhatsApp which number you paid from, so we can find your payment.',
        `If the rest is not received by ${due}, the application ends and the page number is released.`,
        CLOSING.en,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l),
        [l.price, amount(f.price, f.currency)],
        [l.received, amount(f.received, f.currency)],
        [l.payNow, amount(f.stillToPay, f.currency)],
        [l.payBy, due],
        [l.whish, f.whishNumber],
      ],
      link: waLink(f, l),
    }
  },
  E3paid: (f) => ({
    subject: `${oneLine(f.businessName)} is accepted`,
    heading: 'Your business is accepted',
    paragraphs: [
      hello(f.ownerName, 'en'),
      `Good news: we accepted ${f.businessName} for Vardenia.`,
      `The ${amount(f.received, f.currency)} you paid covers the full price: there is nothing more to pay. We will let you know when your page is published.`,
      CLOSING.en,
    ],
    rows: [
      [LABELS.en.reference, f.reference],
      ...pageRow(f, LABELS.en),
      [LABELS.en.received, amount(f.received, f.currency)],
    ],
  }),
  E4: (f) => {
    const l = LABELS.en
    const due = emailDate(f.balanceDueAt, 'en')
    return {
      subject: `Reminder: the rest for ${oneLine(f.businessName)} is due on ${due}`,
      heading: 'A reminder about the rest of the price',
      paragraphs: [
        hello(f.ownerName, 'en'),
        `The rest of the price for ${f.businessName}, ${amount(f.stillToPay, f.currency)}, is due on ${due}. Pay it by Whish to ${f.whishNumber}.`,
        `If it is not received by then, the application ends and the page number is released.`,
        'Already paid? Thank you. If you paid from another number, tell us on WhatsApp which one, so we can find your payment.',
        CLOSING.en,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l),
        [l.payNow, amount(f.stillToPay, f.currency)],
        [l.payBy, due],
        [l.whish, f.whishNumber],
      ],
      link: waLink(f, l),
    }
  },
  E5: (f) => {
    const l = LABELS.en
    return {
      subject: 'About your Vardenia application',
      heading: 'We could not accept your business',
      paragraphs: [
        hello(f.ownerName, 'en'),
        `Thank you for sending ${f.businessName}. We are sorry, but we did not accept it this time.`,
        ...(f.sharedReason ? [`The reason: ${f.sharedReason}`] : []),
        `We will return your ${amount(toReturn(f), f.currency)} by Whish to the number you paid from.`,
        CLOSING.en,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l, true),
        [l.toReturn, amount(toReturn(f), f.currency)],
      ],
    }
  },
  E6: (f) => {
    const l = LABELS.en
    const due = emailDate(f.balanceDueAt, 'en')
    return {
      subject: 'Your Vardenia application has ended',
      heading: balanceDeadlinePassed(f)
        ? 'The deadline to pay the rest has passed'
        : 'Your application has ended',
      paragraphs: [
        hello(f.ownerName, 'en'),
        balanceDeadlinePassed(f)
          ? `The deadline to pay the rest for ${f.businessName} was ${due}, and we did not receive it. Your application has ended and the page number is released.`
          : `We did not receive the rest of the price for ${f.businessName}. Your application has ended and the page number is released.`,
        ...(f.received > 0
          ? [
              `As set out in the terms, the ${amount(f.received, f.currency)} received is not returned.`,
            ]
          : []),
        'To appear in Vardenia, please submit a new form.',
        CLOSING.en,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l, true),
        [l.received, amount(f.received, f.currency)],
        [l.stillToPay, amount(f.stillToPay, f.currency)],
      ],
      link: applyLink(f, l),
    }
  },
  E7: (f) => {
    const l = LABELS.en
    const due = emailDate(f.downpaymentDueAt, 'en')
    return {
      subject: 'The time to pay the downpayment is over',
      heading: 'The time to pay the downpayment is over',
      paragraphs: [
        hello(f.ownerName, 'en'),
        `We did not receive the downpayment for ${f.businessName}${due ? ` by ${due}` : ' in time'}, so the page number has been released.`,
        'To appear in Vardenia, please submit a new form.',
        CLOSING.en,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l, true),
        [l.downpayment, amount(f.downpaymentAmount, f.currency)],
      ],
      link: applyLink(f, l),
    }
  },
  E8: (f) => {
    const l = LABELS.en
    const ends = emailDate(f.contractEndsAt, 'en')
    return {
      subject: `${oneLine(f.businessName)} is now on Vardenia`,
      heading: 'Congratulations',
      paragraphs: [
        hello(f.ownerName, 'en'),
        `${f.businessName} is now published on Vardenia. Thank you for joining us.`,
        ...(ends ? [`Your listing runs until ${ends}.`] : []),
        'If this is your first listing with us, a separate email lets you set the password of your partner account.',
        CLOSING.en,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l),
        [l.received, amount(f.received, f.currency)],
        ...(ends ? ([[l.endsOn, ends]] as [string, string][]) : []),
      ],
    }
  },
}

const AR: Record<PaymentEvent, Copy> = {
  E1: (f) => {
    const l = LABELS.ar
    const due = emailDate(f.downpaymentDueAt, 'ar')
    const rest = amount(f.price - f.downpaymentAmount, f.currency)
    return {
      subject: `ادفع الدفعة الأولى لـ ${oneLine(f.businessName)}`,
      heading: 'وصلنا نموذجك: ادفع الدفعة الأولى',
      paragraphs: [
        hello(f.ownerName, 'ar'),
        `شكراً لإرسال ${f.businessName} إلى فارديينيا.${f.pageNumber !== null ? ` رقم الصفحة ${f.pageNumber} محجوز لك.` : ''}`,
        `للاحتفاظ به، ادفع الدفعة الأولى وقدرها ${amount(f.downpaymentAmount, f.currency)} عبر Whish إلى الرقم ${f.whishNumber} قبل ${due}، من رقم الهاتف الذي أدخلته في النموذج. اكتب مرجعك ${f.reference} في ملاحظة Whish إن أمكن.`,
        'تدفع من رقم آخر؟ أخبرنا على واتساب بالرقم الذي دفعت منه لنجد دفعتك.',
        `عند استلام الدفعة الأولى نراجع مكانك. إذا قبلناه تدفع المبلغ المتبقي (${rest}) ${withinDays(f.balanceDeadlineDays, 'ar')} من القبول. وإذا لم نقبله نعيد إليك الدفعة الأولى عبر Whish إلى الرقم الذي دُفعت منه.`,
        `إذا لم تصلنا الدفعة الأولى قبل ${due} يُحرَّر رقم الصفحة.`,
        CLOSING.ar,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l),
        [l.price, amount(f.price, f.currency)],
        [l.downpayment, amount(f.downpaymentAmount, f.currency)],
        [l.payBy, due],
        [l.whish, f.whishNumber],
      ],
      link: waLink(f, l),
    }
  },
  E1c: (f) => {
    const l = LABELS.ar
    const due = emailDate(f.downpaymentDueAt, 'ar')
    return {
      subject: `تذكير: الدفعة الأولى لـ ${oneLine(f.businessName)}`,
      heading: 'تذكير بالدفعة الأولى',
      paragraphs: [
        hello(f.ownerName, 'ar'),
        `لم تصلنا بعد الدفعة الأولى وقدرها ${amount(f.downpaymentAmount, f.currency)} لـ ${f.businessName}. ادفعها عبر Whish إلى الرقم ${f.whishNumber} قبل ${due}، وإلا يُحرَّر رقم الصفحة.`,
        'دفعت؟ شكراً لك. إذا دفعت من رقم آخر فأخبرنا على واتساب بالرقم لنجد دفعتك.',
        CLOSING.ar,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l),
        [l.downpayment, amount(f.downpaymentAmount, f.currency)],
        [l.payBy, due],
        [l.whish, f.whishNumber],
      ],
      link: waLink(f, l),
    }
  },
  E2: (f) => {
    const l = LABELS.ar
    return {
      subject: 'وصلتنا دفعتك الأولى',
      heading: 'تم استلام الدفعة الأولى',
      paragraphs: [
        hello(f.ownerName, 'ar'),
        `وصلتنا دفعتك الأولى وقدرها ${amount(f.received, f.currency)} لـ ${f.businessName}. شكراً لك.`,
        'نراجع الآن مكانك وسنعاود التواصل معك. إذا قبلناه نخبرك كيف تدفع المبلغ المتبقي.',
        CLOSING.ar,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l),
        [l.price, amount(f.price, f.currency)],
        [l.received, amount(f.received, f.currency)],
        [l.stillToPay, amount(f.stillToPay, f.currency)],
      ],
    }
  },
  E3: (f) => {
    const l = LABELS.ar
    const due = emailDate(f.balanceDueAt, 'ar')
    return {
      subject: `تم قبول ${oneLine(f.businessName)}: ادفع المبلغ المتبقي`,
      heading: 'تم قبول مكانك',
      paragraphs: [
        hello(f.ownerName, 'ar'),
        `خبر سار: قبلنا ${f.businessName} في فارديينيا.`,
        `ادفع المبلغ المتبقي وقدره ${amount(f.stillToPay, f.currency)} عبر Whish إلى الرقم ${f.whishNumber} ${withinDays(f.balanceDeadlineDays, 'ar')}، قبل ${due}. اكتب مرجعك ${f.reference} في ملاحظة Whish إن أمكن.`,
        'تدفع من رقم آخر؟ أخبرنا على واتساب بالرقم الذي دفعت منه لنجد دفعتك.',
        `إذا لم يصلنا المبلغ المتبقي قبل ${due} ينتهي الطلب ويُحرَّر رقم الصفحة.`,
        CLOSING.ar,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l),
        [l.price, amount(f.price, f.currency)],
        [l.received, amount(f.received, f.currency)],
        [l.payNow, amount(f.stillToPay, f.currency)],
        [l.payBy, due],
        [l.whish, f.whishNumber],
      ],
      link: waLink(f, l),
    }
  },
  E3paid: (f) => ({
    subject: `تم قبول ${oneLine(f.businessName)}`,
    heading: 'تم قبول مكانك',
    paragraphs: [
      hello(f.ownerName, 'ar'),
      `خبر سار: قبلنا ${f.businessName} في فارديينيا.`,
      `المبلغ الذي دفعته (${amount(f.received, f.currency)}) يغطي السعر كاملاً: لا يتبقى عليك شيء. سنخبرك عند نشر صفحتك.`,
      CLOSING.ar,
    ],
    rows: [
      [LABELS.ar.reference, f.reference],
      ...pageRow(f, LABELS.ar),
      [LABELS.ar.received, amount(f.received, f.currency)],
    ],
  }),
  E4: (f) => {
    const l = LABELS.ar
    const due = emailDate(f.balanceDueAt, 'ar')
    return {
      subject: `تذكير: المبلغ المتبقي لـ ${oneLine(f.businessName)} مستحق في ${due}`,
      heading: 'تذكير بالمبلغ المتبقي',
      paragraphs: [
        hello(f.ownerName, 'ar'),
        `المبلغ المتبقي لـ ${f.businessName}، وقدره ${amount(f.stillToPay, f.currency)}، مستحق في ${due}. ادفعه عبر Whish إلى الرقم ${f.whishNumber}.`,
        'إذا لم يصلنا قبل ذلك ينتهي الطلب ويُحرَّر رقم الصفحة.',
        'دفعت؟ شكراً لك. إذا دفعت من رقم آخر فأخبرنا على واتساب بالرقم لنجد دفعتك.',
        CLOSING.ar,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l),
        [l.payNow, amount(f.stillToPay, f.currency)],
        [l.payBy, due],
        [l.whish, f.whishNumber],
      ],
      link: waLink(f, l),
    }
  },
  E5: (f) => {
    const l = LABELS.ar
    return {
      subject: 'بخصوص طلبك في فارديينيا',
      heading: 'لم نتمكن من قبول مكانك',
      paragraphs: [
        hello(f.ownerName, 'ar'),
        `شكراً لإرسال ${f.businessName}. نأسف، لم نقبله هذه المرة.`,
        ...(f.sharedReason ? [`السبب: ${f.sharedReason}`] : []),
        `سنعيد إليك ${amount(toReturn(f), f.currency)} عبر Whish إلى الرقم الذي دفعت منه.`,
        CLOSING.ar,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l, true),
        [l.toReturn, amount(toReturn(f), f.currency)],
      ],
    }
  },
  E6: (f) => {
    const l = LABELS.ar
    const due = emailDate(f.balanceDueAt, 'ar')
    return {
      subject: 'انتهى طلبك في فارديينيا',
      heading: balanceDeadlinePassed(f) ? 'انتهت مهلة دفع المبلغ المتبقي' : 'انتهى طلبك',
      paragraphs: [
        hello(f.ownerName, 'ar'),
        balanceDeadlinePassed(f)
          ? `انتهت مهلة دفع المبلغ المتبقي لـ ${f.businessName} في ${due} ولم يصلنا. انتهى طلبك وتم تحرير رقم الصفحة.`
          : `لم يصلنا المبلغ المتبقي لـ ${f.businessName}. انتهى طلبك وتم تحرير رقم الصفحة.`,
        ...(f.received > 0
          ? [`وفقاً للشروط، لا يُعاد المبلغ المستلم وقدره ${amount(f.received, f.currency)}.`]
          : []),
        'لتظهر في فارديينيا، يرجى إرسال نموذج جديد.',
        CLOSING.ar,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l, true),
        [l.received, amount(f.received, f.currency)],
        [l.stillToPay, amount(f.stillToPay, f.currency)],
      ],
      link: applyLink(f, l),
    }
  },
  E7: (f) => {
    const l = LABELS.ar
    const due = emailDate(f.downpaymentDueAt, 'ar')
    return {
      subject: 'انتهت مهلة دفع الدفعة الأولى',
      heading: 'انتهت مهلة دفع الدفعة الأولى',
      paragraphs: [
        hello(f.ownerName, 'ar'),
        `لم تصلنا الدفعة الأولى لـ ${f.businessName}${due ? ` قبل ${due}` : ' في الوقت المحدد'}، لذلك تم تحرير رقم الصفحة.`,
        'لتظهر في فارديينيا، يرجى إرسال نموذج جديد.',
        CLOSING.ar,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l, true),
        [l.downpayment, amount(f.downpaymentAmount, f.currency)],
      ],
      link: applyLink(f, l),
    }
  },
  E8: (f) => {
    const l = LABELS.ar
    const ends = emailDate(f.contractEndsAt, 'ar')
    return {
      subject: `${oneLine(f.businessName)} أصبح على فارديينيا`,
      heading: 'مبروك',
      paragraphs: [
        hello(f.ownerName, 'ar'),
        `تم نشر ${f.businessName} على فارديينيا. شكراً لانضمامك إلينا.`,
        ...(ends ? [`يبقى مكانك مُدرجاً حتى ${ends}.`] : []),
        'إذا كان هذا أول مكان لك معنا، تصلك رسالة منفصلة لتعيين كلمة مرور حساب الشريك.',
        CLOSING.ar,
      ],
      rows: [
        [l.reference, f.reference],
        ...pageRow(f, l),
        [l.received, amount(f.received, f.currency)],
        ...(ends ? ([[l.endsOn, ends]] as [string, string][]) : []),
      ],
    }
  },
}

/** The owner's email for one payment event. */
export function paymentEmail(event: PaymentEvent, facts: PaymentEmailFacts): PlaceSubmissionEmail {
  const arabic = facts.locale === 'ar'
  const { subject, ...body } = (arabic ? AR : EN)[event](facts)
  return {
    subject: oneLine(subject),
    html: emailLayout({ lang: arabic ? 'ar' : 'en', dir: arabic ? dirFor('ar') : 'ltr', ...body }),
    text: emailText(body),
  }
}

/** E6 for the team (English): the owner did not pay the rest in time. */
export function unpaidTeamEmail(facts: PaymentEmailFacts): PlaceSubmissionEmail {
  const due = emailDate(facts.balanceDueAt, 'en')
  const body: Body = {
    heading: 'Rejected: did not pay the rest',
    paragraphs: [
      `${facts.businessName} did not pay the rest${balanceDeadlinePassed(facts) ? ` by the deadline (${due})` : ` (rejected by staff before the deadline, ${due || 'none set'})`}. The submission is rejected, the page number released, and what was received is kept. The owner was told to submit a new form.`,
    ],
    rows: [
      ['Reference', facts.reference],
      ['Business', facts.businessName],
      ...(facts.pageNumber !== null
        ? ([['Page number (released)', String(facts.pageNumber)]] as [string, string][])
        : []),
      ['Received (kept)', amount(facts.received, facts.currency)],
      ['Still to pay', amount(facts.stillToPay, facts.currency)],
    ],
    ...(facts.businessId !== undefined
      ? {
          link: {
            href: `${facts.origin}/admin/collections/businesses/${encodeURIComponent(String(facts.businessId))}`,
            label: 'Open in the admin',
          },
        }
      : {}),
  }
  return {
    subject: oneLine(`Did not pay the rest: ${facts.businessName}`),
    html: emailLayout({ lang: 'en', dir: 'ltr', ...body }),
    text: emailText(body),
  }
}
