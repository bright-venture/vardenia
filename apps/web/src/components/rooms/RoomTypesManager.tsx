'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  HINT,
  INPUT,
  LABEL,
  NOTICE_ERROR,
  NOTICE_SUCCESS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from '../formStyles'

/**
 * The partner's room types: a plain list and a plain form (17 November 2026).
 *
 * Saved through Payload's REST API with the partner's own session cookie. The
 * collection's access rules and guardRoomTypeWrite decide what is allowed, so
 * this form can only ever change the partner's own hotels. Photos are uploaded
 * to the media library first, then linked.
 */

export interface ManagedOption {
  id?: string
  breakfast: boolean
  cancellation: 'free' | 'non-refundable'
  freeCancellationDays: number
  payment: 'at-property' | 'in-advance'
  price: number | null
}

export interface ManagedRoomType {
  id?: number
  business: number
  name: string
  kind: 'room' | 'suite'
  description: string
  beds: string
  sizeM2: number | null
  rooms: number
  sleepsAdults: number
  sleepsChildren: number
  views: string[]
  amenities: string[]
  photos: { id: number; src: string }[]
  options: ManagedOption[]
  active: boolean
  order: number
}

const VIEWS = ['sea', 'mountain', 'city', 'garden', 'pool'] as const
const AMENITIES = [
  'private-bathroom',
  'balcony',
  'kitchenette',
  'air-conditioning',
  'heating',
  'wifi',
  'tv',
  'minibar',
  'coffee-machine',
  'bathtub',
  'work-desk',
  'safe',
  'soundproofing',
  'fireplace',
] as const

const blankOption = (): ManagedOption => ({
  breakfast: false,
  cancellation: 'free',
  freeCancellationDays: 1,
  payment: 'at-property',
  price: null,
})

export function RoomTypesManager({
  locale,
  hotels,
  initial,
}: {
  locale: string
  hotels: { id: number; name: string }[]
  initial: ManagedRoomType[]
}) {
  const t = useTranslations('partnerRooms')
  const tr = useTranslations('rooms')
  const router = useRouter()
  const [editing, setEditing] = useState<ManagedRoomType | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function startNew() {
    setSaved(false)
    setError(null)
    setEditing({
      business: hotels[0]?.id ?? 0,
      name: '',
      kind: 'room',
      description: '',
      beds: '',
      sizeM2: null,
      rooms: 1,
      sleepsAdults: 2,
      sleepsChildren: 0,
      views: [],
      amenities: [],
      photos: [],
      options: [blankOption()],
      active: true,
      order: 0,
    })
  }

  const set = <K extends keyof ManagedRoomType>(key: K, value: ManagedRoomType[K]) =>
    setEditing((current) => (current ? { ...current, [key]: value } : current))

  const setOption = (index: number, patch: Partial<ManagedOption>) =>
    setEditing((current) =>
      current
        ? {
            ...current,
            options: current.options.map((option, i) =>
              i === index ? { ...option, ...patch } : option,
            ),
          }
        : current,
    )

  const toggle = (key: 'views' | 'amenities', value: string) =>
    setEditing((current) =>
      current
        ? {
            ...current,
            [key]: current[key].includes(value)
              ? current[key].filter((v) => v !== value)
              : [...current[key], value],
          }
        : current,
    )

  async function upload(file: File) {
    if (!editing) return
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('_payload', JSON.stringify({ alt: editing.name || 'Room' }))
      const response = await fetch('/api/media', {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      })
      const body = (await response.json().catch(() => null)) as {
        doc?: { id: number; url?: string; sizes?: { thumbnail?: { url?: string } } }
        errors?: { message?: string }[]
      } | null
      if (!response.ok || !body?.doc) throw new Error(body?.errors?.[0]?.message ?? t('error'))
      const doc = body.doc
      set('photos', [
        ...editing.photos,
        { id: doc.id, src: doc.sizes?.thumbnail?.url ?? doc.url ?? '' },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'))
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    if (!editing) return
    setBusy(true)
    setError(null)
    const data = {
      business: editing.business,
      name: editing.name,
      kind: editing.kind,
      description: editing.description,
      beds: editing.beds,
      sizeM2: editing.sizeM2,
      rooms: editing.rooms,
      sleepsAdults: editing.sleepsAdults,
      sleepsChildren: editing.sleepsChildren,
      views: editing.views,
      amenities: editing.amenities,
      photos: editing.photos.map((photo) => photo.id),
      options: editing.options.map((option) => ({
        ...(option.id ? { id: option.id } : {}),
        breakfast: option.breakfast,
        cancellation: option.cancellation,
        freeCancellationDays: option.freeCancellationDays,
        payment: option.payment,
        price: option.price,
      })),
      active: editing.active,
      order: editing.order,
    }
    try {
      const send = async (url: string, method: string, body: unknown) => {
        const response = await fetch(url, {
          method,
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        })
        const json = (await response.json().catch(() => null)) as {
          doc?: { id: number }
          errors?: { message?: string; data?: { errors?: { message?: string }[] } }[]
        } | null
        if (!response.ok) {
          const first = json?.errors?.[0]
          throw new Error(first?.data?.errors?.[0]?.message ?? first?.message ?? t('error'))
        }
        return json
      }
      if (editing.id) {
        await send(`/api/room-types/${editing.id}?locale=${locale}`, 'PATCH', data)
      } else {
        // Created in English first, so the name required in the main language
        // exists; then the same words in the page's language.
        const made = await send('/api/room-types?locale=en', 'POST', data)
        if (locale !== 'en' && made?.doc?.id) {
          await send(`/api/room-types/${made.doc.id}?locale=${locale}`, 'PATCH', {
            name: data.name,
            description: data.description,
            beds: data.beds,
          })
        }
      }
      setEditing(null)
      setSaved(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: number) {
    if (!window.confirm(t('confirmDelete'))) return
    setError(null)
    const response = await fetch(`/api/room-types/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    })
    if (!response.ok) {
      const json = (await response.json().catch(() => null)) as {
        errors?: { message?: string }[]
      } | null
      setError(json?.errors?.[0]?.message ?? t('error'))
      return
    }
    router.refresh()
  }

  const hotelName = (id: number) => hotels.find((hotel) => hotel.id === id)?.name ?? ''

  return (
    <section className="mt-10">
      <h2 className="font-display text-ink-900 text-2xl">{t('title')}</h2>
      <p className="text-ink-500 mt-2 text-sm">{t('intro')}</p>

      {saved ? <p className={`${NOTICE_SUCCESS} mt-4`}>{t('saved')}</p> : null}
      {error && !editing ? <p className={`${NOTICE_ERROR} mt-4`}>{error}</p> : null}

      {!editing ? (
        <>
          {initial.length === 0 ? (
            <p className="text-ink-500 mt-6">{t('none')}</p>
          ) : (
            <ul className="border-ink-100 mt-6 divide-y border">
              {initial.map((room) => (
                <li key={room.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-ink-900 font-semibold">
                      {room.name}{' '}
                      {room.active ? null : (
                        <span className="text-ink-500 font-normal">({t('inactive')})</span>
                      )}
                    </p>
                    <p className="text-ink-500 text-sm">
                      {hotels.length > 1 ? `${hotelName(room.business)} · ` : ''}
                      {t('summary', {
                        rooms: room.rooms,
                        sleeps: room.sleepsAdults + room.sleepsChildren,
                      })}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className={SECONDARY_BUTTON}
                      onClick={() => {
                        setSaved(false)
                        setError(null)
                        setEditing(room)
                      }}
                    >
                      {t('edit')}
                    </button>
                    <button
                      type="button"
                      className="text-state-danger min-h-[44px] px-2 text-sm"
                      onClick={() => room.id && remove(room.id)}
                    >
                      {t('delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={`${PRIMARY_BUTTON} mt-6`} onClick={startNew}>
            {t('add')}
          </button>
        </>
      ) : (
        <form
          className="border-ink-100 mt-6 space-y-5 border p-5"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          {hotels.length > 1 && !editing.id ? (
            <label className="block">
              <span className={LABEL}>{t('listing')}</span>
              <select
                className={`${INPUT} mt-1`}
                value={editing.business}
                onChange={(e) => set('business', Number(e.target.value))}
              >
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>{t('name')}</span>
              <input
                required
                maxLength={120}
                className={`${INPUT} mt-1`}
                value={editing.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </label>
            <label className="block">
              <span className={LABEL}>{t('kind')}</span>
              <select
                className={`${INPUT} mt-1`}
                value={editing.kind}
                onChange={(e) => set('kind', e.target.value as 'room' | 'suite')}
              >
                <option value="room">{t('kindRoom')}</option>
                <option value="suite">{t('kindSuite')}</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className={LABEL}>{t('description')}</span>
            <textarea
              rows={4}
              maxLength={2000}
              className={`${INPUT} mt-1`}
              value={editing.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>{t('beds')}</span>
              <input
                maxLength={160}
                className={`${INPUT} mt-1`}
                value={editing.beds}
                onChange={(e) => set('beds', e.target.value)}
              />
              <span className={HINT}>{t('bedsHint')}</span>
            </label>
            <label className="block">
              <span className={LABEL}>{t('size')}</span>
              <input
                type="number"
                min={1}
                max={2000}
                className={`${INPUT} mt-1`}
                value={editing.sizeM2 ?? ''}
                onChange={(e) => set('sizeM2', e.target.value ? Number(e.target.value) : null)}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className={LABEL}>{t('rooms')}</span>
              <input
                type="number"
                required
                min={0}
                max={1000}
                className={`${INPUT} mt-1`}
                value={editing.rooms}
                onChange={(e) => set('rooms', Number(e.target.value))}
              />
              <span className={HINT}>{t('roomsHint')}</span>
            </label>
            <label className="block">
              <span className={LABEL}>{t('adults')}</span>
              <input
                type="number"
                required
                min={1}
                max={20}
                className={`${INPUT} mt-1`}
                value={editing.sleepsAdults}
                onChange={(e) => set('sleepsAdults', Number(e.target.value))}
              />
            </label>
            <label className="block">
              <span className={LABEL}>{t('children')}</span>
              <input
                type="number"
                min={0}
                max={20}
                className={`${INPUT} mt-1`}
                value={editing.sleepsChildren}
                onChange={(e) => set('sleepsChildren', Number(e.target.value))}
              />
            </label>
          </div>

          <fieldset>
            <legend className={LABEL}>{t('views')}</legend>
            <div className="mt-2 flex flex-wrap gap-x-5">
              {VIEWS.map((view) => (
                <label key={view} className="flex min-h-[44px] items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.views.includes(view)}
                    onChange={() => toggle('views', view)}
                  />
                  {tr(`views.${view}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={LABEL}>{t('amenities')}</legend>
            <div className="mt-2 grid grid-cols-2 gap-x-5 sm:grid-cols-3">
              {AMENITIES.map((amenity) => (
                <label key={amenity} className="flex min-h-[44px] items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.amenities.includes(amenity)}
                    onChange={() => toggle('amenities', amenity)}
                  />
                  {tr(`amenities.${amenity}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={LABEL}>{t('photos')}</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {editing.photos.map((photo) => (
                <div key={photo.id} className="w-28">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.src}
                    alt=""
                    className="bg-surface-sunken aspect-[4/3] w-28 object-cover"
                  />
                  <button
                    type="button"
                    className="text-state-danger mt-1 text-xs"
                    onClick={() =>
                      set(
                        'photos',
                        editing.photos.filter((p) => p.id !== photo.id),
                      )
                    }
                  >
                    {t('removePhoto')}
                  </button>
                </div>
              ))}
            </div>
            <label className={`${SECONDARY_BUTTON} mt-3 inline-flex cursor-pointer`}>
              {uploading ? t('uploading') : t('addPhoto')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void upload(file)
                  e.target.value = ''
                }}
              />
            </label>
          </fieldset>

          <fieldset>
            <legend className={LABEL}>{t('options')}</legend>
            <p className={HINT}>{t('optionsHint')}</p>
            <div className="mt-3 space-y-3">
              {editing.options.map((option, index) => (
                <div
                  key={option.id ?? `new-${index}`}
                  className="border-ink-100 grid gap-3 border p-3 sm:grid-cols-2"
                >
                  <label className="flex min-h-[44px] items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={option.breakfast}
                      onChange={(e) => setOption(index, { breakfast: e.target.checked })}
                    />
                    {t('breakfast')}
                  </label>
                  <label className="block">
                    <span className={LABEL}>{t('cancellation')}</span>
                    <select
                      className={`${INPUT} mt-1`}
                      value={option.cancellation}
                      onChange={(e) =>
                        setOption(index, {
                          cancellation: e.target.value as ManagedOption['cancellation'],
                        })
                      }
                    >
                      <option value="free">{t('free')}</option>
                      <option value="non-refundable">{t('nonRefundable')}</option>
                    </select>
                  </label>
                  {option.cancellation === 'free' ? (
                    <label className="block">
                      <span className={LABEL}>{t('freeDays')}</span>
                      <input
                        type="number"
                        min={0}
                        max={60}
                        className={`${INPUT} mt-1`}
                        value={option.freeCancellationDays}
                        onChange={(e) =>
                          setOption(index, { freeCancellationDays: Number(e.target.value) })
                        }
                      />
                    </label>
                  ) : (
                    <span />
                  )}
                  <label className="block">
                    <span className={LABEL}>{t('payment')}</span>
                    <select
                      className={`${INPUT} mt-1`}
                      value={option.payment}
                      onChange={(e) =>
                        setOption(index, { payment: e.target.value as ManagedOption['payment'] })
                      }
                    >
                      <option value="at-property">{t('atProperty')}</option>
                      <option value="in-advance">{t('inAdvance')}</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className={LABEL}>{t('price')}</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={`${INPUT} mt-1`}
                      value={option.price ?? ''}
                      onChange={(e) =>
                        setOption(index, { price: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                    <span className={HINT}>{t('priceHint')}</span>
                  </label>
                  {editing.options.length > 1 ? (
                    <button
                      type="button"
                      className="text-state-danger justify-self-start text-sm sm:col-span-2"
                      onClick={() =>
                        set(
                          'options',
                          editing.options.filter((_, i) => i !== index),
                        )
                      }
                    >
                      {t('removeOption')}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {editing.options.length < 6 ? (
              <button
                type="button"
                className={`${SECONDARY_BUTTON} mt-3`}
                onClick={() => set('options', [...editing.options, blankOption()])}
              >
                {t('addOption')}
              </button>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex min-h-[44px] items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => set('active', e.target.checked)}
              />
              {t('active')}
            </label>
            <label className="block">
              <span className={LABEL}>{t('order')}</span>
              <input
                type="number"
                className={`${INPUT} mt-1`}
                value={editing.order}
                onChange={(e) => set('order', Number(e.target.value))}
              />
            </label>
          </div>

          {error ? (
            <p className={NOTICE_ERROR} role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex gap-3">
            <button type="submit" className={PRIMARY_BUTTON} disabled={busy || uploading}>
              {busy ? t('saving') : t('save')}
            </button>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => {
                setEditing(null)
                setError(null)
              }}
            >
              {t('cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
