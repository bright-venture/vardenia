'use client'

import { useState, type FormEvent } from 'react'
import { useCategory } from './BusinessCategories'
import { enquiryMail, type EnquiryCopy } from './enquiry-mail'

/**
 * The homepage enquiry. As the designer built it, it prepares an email draft in
 * the reader's own mail app, addressed to the Vardenia mailbox, and stores and
 * sends nothing itself.
 */
export function EnquiryForm({
  email,
  categories,
  interests,
  copy,
}: {
  email: string | null
  categories: { key: string; label: string }[]
  interests: string[]
  copy: EnquiryCopy & {
    business: string
    businessHint: string
    name: string
    nameHint: string
    email: string
    emailHint: string
    location: string
    locationHint: string
    category: string
    interest: string
    message: string
    messageHint: string
    submit: string
    note: string
    ready: string
    openDraft: string
    readyAfter: string
  }
}) {
  const { value: category, set: setCategory } = useCategory()
  const [draft, setDraft] = useState<string | null>(null)
  if (!email) return null

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.reportValidity()) return
    const fields = new FormData(form)
    const field = (name: string) => String(fields.get(name) ?? '').trim()
    const href = enquiryMail(
      email,
      {
        business: field('business'),
        name: field('name'),
        email: field('email'),
        location: field('location'),
        category: categories.find((c) => c.key === category)?.label ?? category,
        interest: field('interest'),
        message: field('message'),
      },
      copy,
    )
    setDraft(href)
    window.location.href = href
  }

  return (
    <form className="vd-biz-form" onSubmit={submit}>
      <div className="vd-biz-form-row">
        <label>
          {copy.business}
          <input
            name="business"
            autoComplete="organization"
            required
            placeholder={copy.businessHint}
          />
        </label>
        <label>
          {copy.name}
          <input name="name" autoComplete="name" required placeholder={copy.nameHint} />
        </label>
      </div>
      <div className="vd-biz-form-row">
        <label>
          {copy.email}
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder={copy.emailHint}
            dir="ltr"
          />
        </label>
        <label>
          {copy.location}
          <input name="location" required placeholder={copy.locationHint} />
        </label>
      </div>
      <div className="vd-biz-form-row">
        <label>
          {copy.category}
          <select name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy.interest}
          <select name="interest" defaultValue={interests[0]}>
            {interests.map((interest) => (
              <option key={interest}>{interest}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        {copy.message}
        <textarea name="message" rows={3} placeholder={copy.messageHint} />
      </label>
      <button className="vd-biz-button vd-biz-button-light" type="submit">
        {copy.submit} <span aria-hidden="true">↗</span>
      </button>
      <p className="vd-biz-form-note">{copy.note}</p>
      <p className="vd-biz-form-status" aria-live="polite">
        {draft ? (
          <>
            {copy.ready} <a href={draft}>{copy.openDraft}</a> {copy.readyAfter}
          </>
        ) : null}
      </p>
    </form>
  )
}
