'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '../../i18n/routing'
import { CONTACT_FIELDS, type ContactField } from '@vardenia/core/contact'
import {
  HOTEL_FACILITIES,
  MAX_POPULAR_FACILITIES,
  MAX_PROPERTY_HIGHLIGHTS,
  PROPERTY_HIGHLIGHTS,
} from '@vardenia/core/hotel-options'
import {
  MAX_STAY_PACKAGES,
  STAY_FEATURES,
  STAY_PACKAGE_UNITS,
  type StayFeature,
  type StayPackageUnit,
} from '@vardenia/core/stay'
import { MAX_SEATING_AREAS } from '@vardenia/core/seating'
import { AMENITIES } from '@vardenia/core/attributes'
import {
  PAYMENT_METHODS,
  adoptRowIds,
  buildListingPatch,
  readSaveErrors,
  splitFieldErrors,
  toggleFacility,
  type PaymentMethod,
  type ListingDraft,
  type ListingKinds,
  type PackageRow,
  type SeatingRow,
  type StayDraft,
} from '../../lib/partner-listing-edit'
import { CheckboxGroup, Field } from './PartnerField'
import {
  ERROR_TEXT,
  HINT,
  LABEL,
  LINK,
  NOTICE_ERROR,
  NOTICE_INFO,
  NOTICE_SUCCESS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from '../formStyles'

/**
 * One listing's public details, edited by its owner (Task 12a, 21 November
 * 2026): the words, the contact details, the address and map link, and per
 * kind of place the hotel facilities, the guest house's stay prices, packages
 * and features, or the restaurant's seating areas.
 *
 * Saved through Payload's own update, `PATCH /api/businesses/:id`, in the
 * page's language, sending only the fields that changed (lib/partner-listing-
 * edit builds the body). The server's refusals are shown as written: beside
 * the field when Payload names one, above the button otherwise.
 *
 * Built only from the shared form strings (formStyles) and the dashboard's
 * existing section pattern; no styles of its own.
 */

export interface DetailsFormListing {
  id: number
  name: string
  kinds: ListingKinds
  descriptionEditable: boolean
  /** Sent with every change off the default language (PatchOptions). */
  requiredName: string | null
  initial: ListingDraft
}

const FEATURE_KEY: Record<StayFeature, string> = {
  musicAllowed: 'featureMusicAllowed',
  eventsHosted: 'featureEventsHosted',
  partiesAllowed: 'featurePartiesAllowed',
  gardenAccess: 'featureGardenAccess',
  barbecue: 'featureBarbecue',
  pool: 'featurePool',
}

const PAYMENT_KEY: Record<PaymentMethod, string> = {
  cash: 'paymentCash',
  card: 'paymentCard',
  whish: 'paymentWhish',
  omt: 'paymentOmt',
}

const UNIT_KEY: Record<StayPackageUnit, string> = {
  'per-night': 'unitPerNight',
  'per-stay': 'unitPerStay',
  'per-person-per-night': 'unitPerPersonPerNight',
}

const SECTION = 'border-ink-100 mt-8 border-t pt-6'
const SECTION_TITLE = 'text-ink-500 font-mono text-[11px] uppercase tracking-[0.14em]'
const CHECK = 'flex min-h-[44px] items-center gap-2 text-sm text-ink-900'

let rowCounter = 0
const newKey = (prefix: string) => `${prefix}-new-${++rowCounter}`

export function ListingDetailsForm({
  listing,
  locale,
  dir,
  showName,
}: {
  listing: DetailsFormListing
  locale: string
  dir: 'ltr' | 'rtl'
  showName: boolean
}) {
  const t = useTranslations('partnerDetails')
  const router = useRouter()
  const { kinds } = listing
  const id = (name: string) => `listing-${listing.id}-${name}`

  const [initial, setInitial] = useState(listing.initial)
  const [draft, setDraft] = useState(listing.initial)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'success' | 'info' | 'error'; text: string } | null>(
    null,
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const label = (option: { en: string; ar: string }) => (locale === 'ar' ? option.ar : option.en)

  function update(change: Partial<ListingDraft>) {
    setDraft((current) => ({ ...current, ...change }))
    setNotice(null)
  }
  const setStay = (change: Partial<StayDraft>) => update({ stay: { ...draft.stay, ...change } })
  const setPackage = (index: number, change: Partial<PackageRow>) =>
    setStay({
      packages: draft.stay.packages.map((row, i) => (i === index ? { ...row, ...change } : row)),
    })
  const setArea = (index: number, change: Partial<SeatingRow>) =>
    update({
      seatingAreas: draft.seatingAreas.map((row, i) => (i === index ? { ...row, ...change } : row)),
    })

  async function save() {
    setFieldErrors({})
    setNotice(null)
    const { body, problems } = buildListingPatch(initial, draft, kinds, {
      descriptionEditable: listing.descriptionEditable,
      dir,
      requiredName: listing.requiredName,
    })
    if (Object.keys(problems).length > 0) {
      setFieldErrors(Object.fromEntries(Object.keys(problems).map((p) => [p, t('invalidNumber')])))
      setNotice({ kind: 'error', text: t('fixFields') })
      return
    }
    if (Object.keys(body).length === 0) {
      setNotice({ kind: 'info', text: t('nothingChanged') })
      return
    }
    setBusy(true)
    try {
      const response = await fetch(
        `/api/businesses/${listing.id}?locale=${encodeURIComponent(locale)}&depth=0`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        },
      )
      const json = (await response.json().catch(() => null)) as unknown
      if (response.ok) {
        const next = adoptRowIds(draft, (json as { doc?: unknown } | null)?.doc)
        setInitial(next)
        setDraft(next)
        setNotice({ kind: 'success', text: t('saved') })
        router.refresh()
        return
      }
      const { fields, message } = readSaveErrors(json)
      // Errors with no input here (a missing name or photo) go in the notice,
      // or a refused save would point at nothing.
      const { placed, unplaced } = splitFieldErrors(fields, kinds, listing.descriptionEditable)
      setFieldErrors(placed)
      const parts = [
        Object.keys(placed).length > 0 ? t('fixFields') : null,
        unplaced.length > 0
          ? t('notSaved', {
              problems: unplaced.map((u) => `${u.label}: ${u.message}`).join(' '),
            })
          : null,
      ].filter(Boolean)
      setNotice({
        kind: 'error',
        text: parts.length > 0 ? parts.join(' ') : (message ?? t('error')),
      })
    } catch {
      setNotice({ kind: 'error', text: t('error') })
    } finally {
      setBusy(false)
    }
  }

  const popularFull = draft.popularFacilities.length >= MAX_POPULAR_FACILITIES
  const highlightsFull = draft.propertyHighlights.length >= MAX_PROPERTY_HIGHLIGHTS

  return (
    <section className="mt-10" aria-labelledby={id('title')}>
      {showName ? (
        <h2 id={id('title')} className="font-display text-ink-900 text-2xl">
          {listing.name}
        </h2>
      ) : (
        <h2 id={id('title')} className="sr-only">
          {listing.name}
        </h2>
      )}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        {/* About */}
        <fieldset className={SECTION}>
          <legend className={SECTION_TITLE}>{t('about')}</legend>
          <div className="mt-4 space-y-5">
            <Field
              fieldId={id('tagline')}
              error={fieldErrors['tagline']}
              title={t('tagline')}
              hint={t('taglineHint')}
            >
              {(props) => (
                <input
                  {...props}
                  dir="auto"
                  maxLength={120}
                  value={draft.tagline}
                  onChange={(e) => update({ tagline: e.target.value })}
                />
              )}
            </Field>
            {listing.descriptionEditable ? (
              <Field
                fieldId={id('description')}
                error={fieldErrors.description}
                title={t('description')}
                hint={t('descriptionHint')}
              >
                {(props) => (
                  <textarea
                    {...props}
                    dir="auto"
                    rows={6}
                    maxLength={5000}
                    value={draft.description}
                    onChange={(e) => update({ description: e.target.value })}
                  />
                )}
              </Field>
            ) : (
              <div>
                <p className={LABEL}>{t('description')}</p>
                <p className={`${NOTICE_INFO} mt-1`}>{t('descriptionLocked')}</p>
              </div>
            )}
          </div>
        </fieldset>

        {/* Contact */}
        <fieldset className={SECTION}>
          <legend className={SECTION_TITLE}>{t('contact')}</legend>
          <p className={HINT}>{t('contactHint')}</p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {CONTACT_FIELDS.map((field: ContactField) => (
              <Field
                key={field}
                fieldId={id(`contact-${field}`)}
                error={fieldErrors[`contact.${field}`]}
                title={t(field)}
              >
                {(props) => (
                  <input
                    {...props}
                    dir="ltr"
                    type={
                      field === 'email'
                        ? 'email'
                        : field === 'phone' || field === 'whatsapp'
                          ? 'tel'
                          : 'text'
                    }
                    autoComplete="off"
                    maxLength={300}
                    value={draft.contact[field]}
                    onChange={(e) =>
                      update({ contact: { ...draft.contact, [field]: e.target.value } })
                    }
                  />
                )}
              </Field>
            ))}
          </div>
        </fieldset>

        {/* Address and map */}
        <fieldset className={SECTION}>
          <legend className={SECTION_TITLE}>{t('location')}</legend>
          <div className="mt-4 space-y-5">
            <Field fieldId={id('address')} error={fieldErrors['address']} title={t('address')}>
              {(props) => (
                <textarea
                  {...props}
                  dir="auto"
                  rows={2}
                  maxLength={300}
                  value={draft.address}
                  onChange={(e) => update({ address: e.target.value })}
                />
              )}
            </Field>
            <Field
              fieldId={id('mapUrl')}
              error={fieldErrors['mapUrl']}
              title={t('mapUrl')}
              hint={t('mapUrlHint')}
            >
              {(props) => (
                <input
                  {...props}
                  dir="ltr"
                  type="url"
                  inputMode="url"
                  maxLength={2000}
                  value={draft.mapUrl}
                  onChange={(e) => update({ mapUrl: e.target.value })}
                />
              )}
            </Field>
          </div>
        </fieldset>

        {/* Every kind: amenities and payment methods */}
        <div className={SECTION}>
          <CheckboxGroup
            groupId={id('amenities')}
            legend={t('amenities')}
            error={fieldErrors.amenities}
            options={AMENITIES.map((option) => ({
              value: option.slug,
              label: label(option),
              checked: draft.amenities.includes(option.slug),
              onChange: (checked) =>
                update({
                  amenities: checked
                    ? [...draft.amenities, option.slug]
                    : draft.amenities.filter((s) => s !== option.slug),
                }),
            }))}
          />
          <CheckboxGroup
            groupId={id('payments')}
            legend={t('payments')}
            hint={t('paymentsHint')}
            error={fieldErrors.payments}
            options={PAYMENT_METHODS.map((method) => ({
              value: method,
              label: t(PAYMENT_KEY[method]),
              checked: draft.payments[method],
              onChange: (checked) => update({ payments: { ...draft.payments, [method]: checked } }),
            }))}
          />
        </div>

        {/* Hotels: facilities, popular facilities, highlights */}
        {kinds.hotel ? (
          <fieldset className={SECTION}>
            <legend className={SECTION_TITLE}>{t('facilitiesTitle')}</legend>

            <CheckboxGroup
              groupId={id('facilities')}
              legend={t('facilities')}
              error={fieldErrors.facilities}
              options={HOTEL_FACILITIES.map((option) => ({
                value: option.slug,
                label: label(option),
                checked: draft.facilities.includes(option.slug),
                onChange: () => update(toggleFacility(draft, option.slug)),
              }))}
            />
            <CheckboxGroup
              groupId={id('popular')}
              legend={t('popularFacilities')}
              hint={t('popularHint', { max: MAX_POPULAR_FACILITIES })}
              error={fieldErrors.popularFacilities}
              options={HOTEL_FACILITIES.filter((option) =>
                draft.facilities.includes(option.slug),
              ).map((option) => {
                const on = draft.popularFacilities.includes(option.slug)
                return {
                  value: option.slug,
                  label: label(option),
                  checked: on,
                  disabled: !on && popularFull,
                  onChange: () =>
                    update({
                      popularFacilities: on
                        ? draft.popularFacilities.filter((s) => s !== option.slug)
                        : [...draft.popularFacilities, option.slug],
                    }),
                }
              })}
            />
            <CheckboxGroup
              groupId={id('highlights')}
              legend={t('highlights')}
              hint={t('highlightsHint', { max: MAX_PROPERTY_HIGHLIGHTS })}
              error={fieldErrors.propertyHighlights}
              options={PROPERTY_HIGHLIGHTS.map((option) => {
                const on = draft.propertyHighlights.includes(option.slug)
                return {
                  value: option.slug,
                  label: label(option),
                  checked: on,
                  disabled: !on && highlightsFull,
                  onChange: () =>
                    update({
                      propertyHighlights: on
                        ? draft.propertyHighlights.filter((s) => s !== option.slug)
                        : [...draft.propertyHighlights, option.slug],
                    }),
                }
              })}
            />
          </fieldset>
        ) : null}

        {/* Guest houses: stay prices, packages, features */}
        {kinds.getaway ? (
          <>
            <fieldset className={SECTION}>
              <legend className={SECTION_TITLE}>{t('stayTitle')}</legend>
              <p className={HINT}>{t('stayHint')}</p>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                {(
                  [
                    ['nightlyPrice', 0.01, undefined],
                    ['extraGuestFee', 0.01, undefined],
                    ['includedGuests', 1, undefined],
                    ['maxGuests', 1, t('maxGuestsHint')],
                    ['minNights', 1, undefined],
                  ] as const
                ).map(([name, step, hint]) => (
                  <Field
                    key={name}
                    fieldId={id(`stay-${name}`)}
                    error={fieldErrors[`stay.${name}`]}
                    title={t(name)}
                    hint={hint}
                  >
                    {(props) => (
                      <input
                        {...props}
                        dir="ltr"
                        type="text"
                        inputMode={step === 1 ? 'numeric' : 'decimal'}
                        autoComplete="off"
                        value={draft.stay[name]}
                        onChange={(e) => setStay({ [name]: e.target.value })}
                      />
                    )}
                  </Field>
                ))}
              </div>
              <label className={`${CHECK} mt-3`}>
                <input
                  type="checkbox"
                  checked={draft.stay.childrenCountAsGuests}
                  onChange={(e) => setStay({ childrenCountAsGuests: e.target.checked })}
                />
                {t('childrenCountAsGuests')}
              </label>
              {fieldErrors.stay ? <p className={ERROR_TEXT}>{fieldErrors.stay}</p> : null}

              <p className={`${LABEL} mt-6`}>{t('packages')}</p>
              <p className={HINT}>{t('packagesHint', { max: MAX_STAY_PACKAGES })}</p>
              <ul className="mt-3 space-y-4">
                {draft.stay.packages.map((row, index) => (
                  <li key={row.key} className="border-ink-100 grid gap-4 border p-4 sm:grid-cols-2">
                    <Field
                      fieldId={id(`package-${row.key}-label`)}
                      error={fieldErrors[`stay.packages.${index}.label`]}
                      title={t('packageLabel')}
                    >
                      {(props) => (
                        <input
                          {...props}
                          dir="auto"
                          required
                          maxLength={120}
                          value={row.label}
                          onChange={(e) => setPackage(index, { label: e.target.value })}
                        />
                      )}
                    </Field>
                    <Field
                      fieldId={id(`package-${row.key}-price`)}
                      error={fieldErrors[`stay.packages.${index}.price`]}
                      title={t('packagePrice')}
                    >
                      {(props) => (
                        <input
                          {...props}
                          dir="ltr"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          required
                          value={row.price}
                          onChange={(e) => setPackage(index, { price: e.target.value })}
                        />
                      )}
                    </Field>
                    <div className="sm:col-span-2">
                      <Field
                        fieldId={id(`package-${row.key}-description`)}
                        error={fieldErrors[`stay.packages.${index}.description`]}
                        title={t('packageDescription')}
                      >
                        {(props) => (
                          <textarea
                            {...props}
                            dir="auto"
                            rows={2}
                            maxLength={1000}
                            value={row.description}
                            onChange={(e) => setPackage(index, { description: e.target.value })}
                          />
                        )}
                      </Field>
                    </div>
                    <Field
                      fieldId={id(`package-${row.key}-unit`)}
                      error={fieldErrors[`stay.packages.${index}.unit`]}
                      title={t('packageUnit')}
                    >
                      {(props) => (
                        <select
                          {...props}
                          value={row.unit}
                          onChange={(e) =>
                            setPackage(index, { unit: e.target.value as StayPackageUnit })
                          }
                        >
                          {STAY_PACKAGE_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {t(UNIT_KEY[unit])}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <label className={CHECK}>
                        <input
                          type="checkbox"
                          checked={row.active}
                          onChange={(e) => setPackage(index, { active: e.target.checked })}
                        />
                        {t('packageActive')}
                      </label>
                      <button
                        type="button"
                        className={`${LINK} min-h-[44px] text-sm`}
                        onClick={() =>
                          setStay({ packages: draft.stay.packages.filter((_, i) => i !== index) })
                        }
                      >
                        {t('removePackage')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {draft.stay.packages.length < MAX_STAY_PACKAGES ? (
                <button
                  type="button"
                  className={`${SECONDARY_BUTTON} mt-4 px-4 py-2 text-xs`}
                  onClick={() =>
                    setStay({
                      packages: [
                        ...draft.stay.packages,
                        {
                          key: newKey('package'),
                          id: null,
                          label: '',
                          description: '',
                          price: '',
                          unit: 'per-stay',
                          active: true,
                        },
                      ],
                    })
                  }
                >
                  {t('addPackage')}
                </button>
              ) : null}
            </fieldset>

            <div className={SECTION}>
              <CheckboxGroup
                groupId={id('features')}
                legend={t('featuresTitle')}
                error={fieldErrors.features}
                options={STAY_FEATURES.map((feature) => ({
                  value: feature,
                  label: t(FEATURE_KEY[feature]),
                  checked: draft.features[feature],
                  onChange: (checked) =>
                    update({ features: { ...draft.features, [feature]: checked } }),
                }))}
              />
            </div>
          </>
        ) : null}

        {/* Restaurants: seating areas. No prices. */}
        {kinds.seating ? (
          <fieldset className={SECTION}>
            <legend className={SECTION_TITLE}>{t('seatingTitle')}</legend>
            <p className={HINT}>{t('seatingHint', { max: MAX_SEATING_AREAS })}</p>
            <ul className="mt-3 space-y-4">
              {draft.seatingAreas.map((row, index) => (
                <li key={row.key} className="border-ink-100 grid gap-4 border p-4 sm:grid-cols-2">
                  <Field
                    fieldId={id(`area-${row.key}-setting`)}
                    error={fieldErrors[`seatingAreas.${index}.setting`]}
                    title={t('setting')}
                  >
                    {(props) => (
                      <select
                        {...props}
                        value={row.setting}
                        onChange={(e) =>
                          setArea(index, {
                            setting: e.target.value === 'outdoor' ? 'outdoor' : 'indoor',
                          })
                        }
                      >
                        <option value="indoor">{t('indoor')}</option>
                        <option value="outdoor">{t('outdoor')}</option>
                      </select>
                    )}
                  </Field>
                  <Field
                    fieldId={id(`area-${row.key}-tables`)}
                    error={fieldErrors[`seatingAreas.${index}.tables`]}
                    title={t('tables')}
                  >
                    {(props) => (
                      <input
                        {...props}
                        dir="ltr"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        required
                        value={row.tables}
                        onChange={(e) => setArea(index, { tables: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field
                    fieldId={id(`area-${row.key}-label`)}
                    error={fieldErrors[`seatingAreas.${index}.label`]}
                    title={t('areaLabel')}
                  >
                    {(props) => (
                      <input
                        {...props}
                        dir="auto"
                        maxLength={80}
                        value={row.label}
                        onChange={(e) => setArea(index, { label: e.target.value })}
                      />
                    )}
                  </Field>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <label className={CHECK}>
                      <input
                        type="checkbox"
                        checked={row.smoking}
                        onChange={(e) => setArea(index, { smoking: e.target.checked })}
                      />
                      {t('smoking')}
                    </label>
                    <button
                      type="button"
                      className={`${LINK} min-h-[44px] text-sm`}
                      onClick={() =>
                        update({ seatingAreas: draft.seatingAreas.filter((_, i) => i !== index) })
                      }
                    >
                      {t('removeArea')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {fieldErrors.seatingAreas ? (
              <p className={ERROR_TEXT}>{fieldErrors.seatingAreas}</p>
            ) : null}
            {draft.seatingAreas.length < MAX_SEATING_AREAS ? (
              <button
                type="button"
                className={`${SECONDARY_BUTTON} mt-4 px-4 py-2 text-xs`}
                onClick={() =>
                  update({
                    seatingAreas: [
                      ...draft.seatingAreas,
                      {
                        key: newKey('area'),
                        id: null,
                        setting: 'indoor',
                        smoking: false,
                        tables: '',
                        label: '',
                      },
                    ],
                  })
                }
              >
                {t('addArea')}
              </button>
            ) : null}
          </fieldset>
        ) : null}

        <div className="border-ink-100 mt-8 border-t pt-6">
          {notice ? (
            <p
              className={`${
                notice.kind === 'success'
                  ? NOTICE_SUCCESS
                  : notice.kind === 'info'
                    ? NOTICE_INFO
                    : NOTICE_ERROR
              } mb-4`}
              role={notice.kind === 'error' ? 'alert' : 'status'}
            >
              {notice.text}
            </p>
          ) : null}
          <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
            {busy ? t('saving') : t('save')}
          </button>
        </div>
      </form>
    </section>
  )
}
