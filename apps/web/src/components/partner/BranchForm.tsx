'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '../../i18n/routing'
import { CONTACT_FIELDS } from '@vardenia/core/contact'
import { GOVERNORATES } from '@vardenia/core/regions'
import {
  branchIssueKey,
  buildBranchBody,
  emptyBranchDraft,
  readBranchResponse,
  validateBranchDraft,
  type BranchDraft,
} from '../../lib/partner-branch-form'
import { Field } from './PartnerField'
import { HINT, NOTICE_ERROR, NOTICE_SUCCESS, PRIMARY_BUTTON, SECONDARY_BUTTON } from '../formStyles'

/**
 * A partner adds a branch of a restaurant they own (Task 12a, 21 November
 * 2026), through `POST /partner-data/branches` (Task 9). The team reviews the
 * new listing, sets its tier and contract and publishes it; until then it is a
 * draft only the partner and the team see. The server's refusals - a field,
 * the brand's limit, the daily limit - are shown as written.
 */

/** The paths this form has an input for. */
const PLACED = /^(sourceListingId|name|governorate|city|address|mapUrl|location|contact\.\w+)$/

export function BranchForm({
  sources,
  locale,
  limits,
}: {
  /** The partner's restaurants: a branch is added from one of them. */
  sources: { id: number; name: string }[]
  locale: string
  limits: { brand: number; day: number }
}) {
  const t = useTranslations('partnerBranches')
  const contactT = useTranslations('partnerDetails')
  const router = useRouter()

  const [draft, setDraft] = useState<BranchDraft>(() => emptyBranchDraft(sources[0]?.id ?? null))
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const governorate = GOVERNORATES.find((g) => g.slug === draft.governorate)
  const named = (option: { en: string; ar: string }) => (locale === 'ar' ? option.ar : option.en)
  const update = (change: Partial<BranchDraft>) =>
    setDraft((current) => ({ ...current, ...change }))

  async function submit() {
    setProblem(null)
    setFieldErrors({})
    // The required fields, caught here in the reader's language.
    const missing = validateBranchDraft(draft)
    if (Object.keys(missing).length > 0) {
      setFieldErrors(
        Object.fromEntries(Object.entries(missing).map(([path, key]) => [path, t(key)])),
      )
      setProblem(t('fixFields'))
      return
    }
    setBusy(true)
    try {
      const response = await fetch('/partner-data/branches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(buildBranchBody(draft, locale)),
      })
      const json = (await response.json().catch(() => null)) as unknown
      const result = readBranchResponse(response.status, json)
      if (result.ok) {
        setDone(true)
        setDraft(emptyBranchDraft(sources[0]?.id ?? null))
        router.refresh()
        return
      }
      // The schema's English, said in the reader's language (branchIssueKey).
      // An issue with no field here (an unknown key) is still said, generally.
      const placed: Record<string, string> = {}
      let unplaced = false
      for (const [path, message] of Object.entries(result.fields)) {
        if (PLACED.test(path)) placed[path] = t(branchIssueKey(path, message))
        else unplaced = true
      }
      setFieldErrors(placed)
      setProblem(
        result.code === 'too-many'
          ? t('tooMany')
          : Object.keys(placed).length > 0
            ? t('fixFields')
            : unplaced
              ? t('errInvalid')
              : (result.message ?? t('error')),
      )
    } catch {
      setProblem(t('error'))
    } finally {
      setBusy(false)
    }
  }

  if (sources.length === 0) return null

  if (done) {
    return (
      <div className="mt-6">
        <p className={NOTICE_SUCCESS} role="status">
          {t('success')}
        </p>
        <button
          type="button"
          className={`${SECONDARY_BUTTON} mt-4 px-4 py-2 text-xs`}
          onClick={() => setDone(false)}
        >
          {t('addAnother')}
        </button>
      </div>
    )
  }

  return (
    <form
      noValidate
      className="mt-6 space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <p className="text-ink-500 text-sm">{t('limits', limits)}</p>

      {sources.length > 1 ? (
        <Field fieldId="branch-source" title={t('source')} error={fieldErrors.sourceListingId}>
          {(props) => (
            <select
              {...props}
              value={draft.sourceListingId}
              onChange={(e) => update({ sourceListingId: e.target.value })}
            >
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}

      <Field fieldId="branch-name" title={t('name')} hint={t('nameHint')} error={fieldErrors.name}>
        {(props) => (
          <input
            {...props}
            dir="auto"
            required
            maxLength={160}
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          fieldId="branch-governorate"
          title={t('governorate')}
          error={fieldErrors.governorate}
        >
          {(props) => (
            <select
              {...props}
              required
              value={draft.governorate}
              onChange={(e) => update({ governorate: e.target.value, city: '' })}
            >
              <option value="">{t('chooseGovernorate')}</option>
              {GOVERNORATES.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {named(g)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field fieldId="branch-city" title={t('city')} error={fieldErrors.city}>
          {(props) => (
            <select
              {...props}
              disabled={!governorate}
              value={draft.city}
              onChange={(e) => update({ city: e.target.value })}
            >
              <option value="">{t('chooseCity')}</option>
              {(governorate?.cities ?? []).map((d) => (
                <option key={d.slug} value={d.slug}>
                  {named(d)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <Field fieldId="branch-address" title={t('address')} error={fieldErrors.address}>
        {(props) => (
          <textarea
            {...props}
            dir="auto"
            rows={2}
            required
            maxLength={300}
            value={draft.address}
            onChange={(e) => update({ address: e.target.value })}
          />
        )}
      </Field>

      <Field
        fieldId="branch-map"
        title={t('mapUrl')}
        hint={t('mapUrlHint')}
        error={fieldErrors.mapUrl ?? fieldErrors.location}
      >
        {(props) => (
          <input
            {...props}
            dir="ltr"
            type="url"
            inputMode="url"
            required
            maxLength={2000}
            value={draft.mapUrl}
            onChange={(e) => update({ mapUrl: e.target.value })}
          />
        )}
      </Field>

      <fieldset className="border-ink-100 border-t pt-5">
        <legend className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.14em]">
          {t('contactTitle')}
        </legend>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {CONTACT_FIELDS.map((field) => (
            <Field
              key={field}
              fieldId={`branch-contact-${field}`}
              title={contactT(field)}
              error={fieldErrors[`contact.${field}`]}
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

      <p className={HINT}>{t('laterNote')}</p>

      {problem ? (
        <p className={NOTICE_ERROR} role="alert">
          {problem}
        </p>
      ) : null}

      <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
        {busy ? t('sending') : t('submit')}
      </button>
    </form>
  )
}
