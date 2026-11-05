# Profile localization follow-up

## Implemented in this pass

`apps/web/src/components/ProfileForms.tsx` now uses existing, already translated messages in all ten locales (en, ar, fr, es, pt, ru, zh, hi, bn, ur):

- `account.name`, `account.email`, `account.password` for disclosure labels.
- `account.name`, `account.newPassword` for matching input labels.
- `account.rule_length` for the ten-character requirement.
- `account.working` and `common.save` for submit actions.
- `common.saved` and `common.error` for fallback feedback.

The field-specific API messages remain authoritative. Request payloads, endpoints, validation, session behavior and email delivery are unchanged. No catalog files changed and no new translations were invented.

## Remaining UI copy

These strings have no semantically equivalent existing catalog key. Add reviewed profile-specific keys to all ten catalogs rather than replacing them with misleading generic password/email labels:

1. “New email address”
2. “Your current password”
3. “Current password” (can share a single reviewed current-password key with item 2)
4. “We will send a link to the new address to confirm it, and tell your old address that it changed.”

Thus three new message concepts are needed, with consistent wording for the two current-password labels. The email warning communicates account-security behavior and must retain both recipients and purposes in every translation.

## API feedback still in English

`apps/web/src/app/auth/profile/route.ts` returns these literal messages:

- Enter your name.
- Enter a valid email address.
- Use at least 10 characters.
- That is longer than we can store.
- Enter your current password.
- Expected a JSON body.
- Sign in first.
- Your name has been updated.
- That password is not right.
- Your password has been changed.
- That is already your address.
- That address is already in use.
- Check the new address for a link to confirm it.

Zod also supplies default messages for type/discriminant errors and the 80-character name maximum. A complete pass should introduce stable response codes and localize them at the presentation boundary, with a safe fallback for unknown responses. Do not translate arbitrary server strings by substring matching or lose field associations. The shared rate-limit wrapper's response also needs auditing.

The old-address security notification subject/body in that route and the shared `verificationEmail` template are separate email-localization scope; this UI pass does not change them.

## Verification

- Profile component tests: 14 passing, including rendering with each actual locale catalog and Arabic network-error feedback.
- Scoped ESLint: passed.
- Full web TypeScript check: passed.
- Authenticated browser behavior and live API/email flows were not tested.
