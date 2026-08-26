/**
 * Cookie settings shared by every collection that issues a session.
 *
 * # What Payload does without this
 *
 * `addDefaultsToAuthConfig` fills in `{ sameSite: 'Lax', secure: false }`. The
 * first half is right and the second is not. Read off the wire before this
 * existed:
 *
 *     set-cookie: payload-token=...; Path=/; HttpOnly=true; SameSite=Lax
 *
 * No `Secure`, so nothing stopped a browser putting the session token on a plain
 * http request. In practice HSTS is set to two years with preload and Cloudflare
 * sits in front, so a browser that has already seen the site will not make one -
 * but the first visit is not covered by either, and this costs nothing.
 *
 * # Why it is keyed off NODE_ENV rather than simply true
 *
 * A `Secure` cookie is discarded by the browser over plain http. Local
 * development is http, so hardcoding true would mean nobody could stay signed in
 * on localhost - including the admin panel. `next dev` sets NODE_ENV to
 * development and `next build`/`next start` set it to production, so the two
 * cases separate themselves without anyone remembering a flag.
 *
 * The value is read once, when the config is built, which is boot. That is the
 * right time: it is a property of the deployment, not of a request.
 */
export const SESSION_COOKIES = {
  sameSite: 'Lax',
  secure: process.env.NODE_ENV === 'production',
} as const
