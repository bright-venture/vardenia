/**
 * The two emails that carry a link somebody has to click.
 *
 * Payload builds both by default and both defaults point into the admin panel:
 * verification at `/admin/customers/verify/<token>`, reset at
 * `/admin/reset-password?token=...`. For a staff user that is right. For a
 * customer it is a dead end - `admin.user` binds the panel to the `users`
 * collection, so they arrive somewhere they cannot even sign in.
 *
 * That made sign-up impossible to complete rather than merely awkward:
 * `verify: true` means an account does nothing until the address is proven, and
 * the only thing that proves it was a link to the wrong place.
 *
 * # Both languages in one message
 *
 * Not one language chosen. The same decision as the 404 page, and for a stronger
 * reason here: a reset can be triggered by somebody who booked as a guest months
 * ago, or by staff from the admin, and in neither case do we know what they
 * read. Guessing produces a message a reader cannot act on. Two short paragraphs
 * they can, and the Arabic is marked `dir="rtl"` so it renders properly rather
 * than as reversed punctuation.
 *
 * # Shape of the message
 *
 * A plain-text part as well as HTML, like the booking confirmation, because
 * HTML-only mail with a single link in it is the exact shape every spam filter
 * is looking for. Unlike the booking confirmation these must carry a link, so
 * the link is written out in full rather than hidden behind "click here" - a URL
 * somebody can read and compare to the address bar is the difference between our
 * mail and the mail pretending to be ours.
 */

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Where the links point.
 *
 * Built from NEXT_PUBLIC_SITE_URL, which every environment already sets because
 * the printed QR codes depend on it. Falls back to localhost so a developer
 * pressing sign-up does not get a link to `undefined/account/verify/...`.
 */
export function siteOrigin(value: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  try {
    return new URL(value ?? 'http://localhost:3000').origin
  } catch {
    return 'http://localhost:3000'
  }
}

/**
 * The token goes in the path, not the query string.
 *
 * It has to be in the URL somewhere - an email can only carry a URL - but a path
 * segment is less widely captured than a query parameter, which analytics and
 * proxies routinely log in full. Neither is secret-safe, which is why both
 * tokens are single-use and short-lived.
 */
export const verifyUrl = (token: string, origin = siteOrigin()) =>
  `${origin}/account/verify/${encodeURIComponent(token)}`

export const resetUrl = (token: string, origin = siteOrigin()) =>
  `${origin}/account/reset/${encodeURIComponent(token)}`

export interface AuthEmailContent {
  subject: string
  html: string
  text: string
}

interface Copy {
  subject: string
  heading: string
  en: string
  ar: string
  action: string
  ignoreEn: string
  ignoreAr: string
}

const VERIFY: Copy = {
  subject: 'Confirm your email - تأكيد بريدك الإلكتروني',
  heading: 'Confirm your email',
  en: 'Welcome to Vardenia. Open the link below to confirm this address, and your account is ready.',
  ar: 'أهلًا بك في فاردينيا. افتح الرابط أدناه لتأكيد هذا العنوان، وسيصبح حسابك جاهزًا.',
  action: 'Confirm this address',
  ignoreEn: 'If you did not create an account, you can ignore this message.',
  ignoreAr: 'إذا لم تنشئ حسابًا، يمكنك تجاهل هذه الرسالة.',
}

const RESET: Copy = {
  subject: 'Set your password - تعيين كلمة المرور',
  heading: 'Set your password',
  en: 'Open the link below to choose a password for your Vardenia account. The link works once and expires shortly.',
  ar: 'افتح الرابط أدناه لاختيار كلمة مرور لحسابك في فاردينيا. الرابط يعمل مرة واحدة وينتهي بعد فترة قصيرة.',
  action: 'Set a password',
  ignoreEn: 'If you did not ask for this, you can ignore this message and nothing will change.',
  ignoreAr: 'إذا لم تطلب ذلك، تجاهل هذه الرسالة ولن يتغير شيء.',
}

function render(copy: Copy, url: string): AuthEmailContent {
  const text = [
    copy.heading,
    '',
    copy.en,
    '',
    url,
    '',
    copy.ignoreEn,
    '',
    '---',
    '',
    copy.ar,
    '',
    url,
    '',
    copy.ignoreAr,
    '',
    'Vardenia',
  ].join('\n')

  const safeUrl = escapeHtml(url)

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#faf9f7;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e8e4de;border-radius:8px;padding:32px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a08a5b;">Vardenia</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:normal;">${escapeHtml(copy.heading)}</h1>

    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4a4a4a;">${escapeHtml(copy.en)}</p>

    <p style="margin:0 0 20px;">
      <a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#1a1a1a;color:#ffffff;font-size:15px;text-decoration:none;border-radius:6px;">${escapeHtml(copy.action)}</a>
    </p>

    <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#7a7a7a;word-break:break-all;">${safeUrl}</p>

    <p style="margin:0 0 24px;font-size:13px;color:#7a7a7a;">${escapeHtml(copy.ignoreEn)}</p>

    <div dir="rtl" lang="ar" style="border-top:1px solid #f0ede8;padding-top:24px;text-align:right;font-family:'Segoe UI',Tahoma,sans-serif;">
      <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#4a4a4a;">${escapeHtml(copy.ar)}</p>
      <p style="margin:0;font-size:13px;color:#7a7a7a;">${escapeHtml(copy.ignoreAr)}</p>
    </div>
  </div>
</body>
</html>`

  return { subject: copy.subject, html, text }
}

export const verificationEmail = (token: string, origin = siteOrigin()): AuthEmailContent =>
  render(VERIFY, verifyUrl(token, origin))

export const passwordResetEmail = (token: string, origin = siteOrigin()): AuthEmailContent =>
  render(RESET, resetUrl(token, origin))
