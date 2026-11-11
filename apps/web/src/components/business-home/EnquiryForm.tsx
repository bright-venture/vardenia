'use client'

import { useState, type FormEvent } from 'react'
import { useCategory } from './BusinessCategories'
import {
  enquiryDraft,
  gmailLink,
  isHandheld,
  mailtoLink,
  outlookLink,
  type EnquiryCopy,
} from './enquiry-mail'

/**
 * The homepage enquiry. It prepares an email to the Vardenia mailbox and stores
 * and sends nothing itself: on a phone in the mail app, on a computer in Gmail
 * in a new tab, with Outlook and the mail app offered beside it (a computer
 * often has no mail app set up, and there a mailto: link does nothing).
 */
export function EnquiryForm({
  email,
  categories,
  copy,
}: {
  email: string | null
  categories: { key: string; label: string }[]
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
    message: string
    messageHint: string
    submit: string
    note: string
    ready: string
    openDraft: string
    readyAfter: string
    openedGmail: string
    otherMail: string
    emailApp: string
  }
}) {
  const { value: category, set: setCategory } = useCategory()
  const [sent, setSent] = useState<{
    handheld: boolean
    opened: boolean
    mailto: string
    gmail: string
    outlook: string
  } | null>(null)
  if (!email) return null

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.reportValidity()) return
    const fields = new FormData(form)
    const field = (name: string) => String(fields.get(name) ?? '').trim()
    const draft = enquiryDraft(
      email,
      {
        business: field('business'),
        name: field('name'),
        email: field('email'),
        location: field('location'),
        category: categories.find((c) => c.key === category)?.label ?? category,
        message: field('message'),
      },
      copy,
    )
    const links = {
      mailto: mailtoLink(draft),
      gmail: gmailLink(draft),
      outlook: outlookLink(draft),
    }
    const handheld = isHandheld(navigator.userAgent, matchMedia('(pointer: coarse)').matches)
    if (handheld) {
      window.location.href = links.mailto
      setSent({ handheld, opened: true, ...links })
    } else {
      // Inside the submit, so the browser counts it as the reader's own click.
      // Not 'noopener': with it, window.open returns null even when the tab
      // opened, and the page could not tell a blocked pop-up from Gmail.
      const tab = window.open(links.gmail, '_blank')
      if (tab) tab.opener = null
      setSent({ handheld, opened: Boolean(tab), ...links })
    }
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
        {sent?.handheld ? (
          <>
            {copy.ready} <a href={sent.mailto}>{copy.openDraft}</a> {copy.readyAfter}
          </>
        ) : sent ? (
          <>
            {copy.ready} {sent.opened ? `${copy.openedGmail} ` : null}
            {copy.otherMail}{' '}
            {sent.opened ? null : (
              <>
                <a href={sent.gmail} target="_blank" rel="noopener noreferrer">
                  Gmail
                </a>
                {' · '}
              </>
            )}
            <a href={sent.outlook} target="_blank" rel="noopener noreferrer">
              Outlook
            </a>
            {' · '}
            <a href={sent.mailto}>{copy.emailApp}</a>
          </>
        ) : null}
      </p>
    </form>
  )
}
