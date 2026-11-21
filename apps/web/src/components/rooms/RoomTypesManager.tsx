'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ROOM_AMENITIES, ROOM_VIEWS, roomOptionLabel } from '@vardenia/core/hotel-options'
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
  /** Nights opened for sale, from today on. See the Room dates collection. */
  periods: { id: number; startsOn: string; endsOn: string; rooms: number }[]
}

export interface ManagedHotel {
  id: number
  name: string
  checkIn: string
  checkOut: string
}

const VIEWS = ROOM_VIEWS.map((o) => o.slug)
const AMENITIES = ROOM_AMENITIES.map((o) => o.slug)

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
  today,
}: {
  locale: string
  hotels: ManagedHotel[]
  initial: ManagedRoomType[]
  /** Beirut's today, the first night that can be opened. */
  today: string
}) {
  const t = useTranslations('partnerRooms')
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
      periods: [],
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
      {!editing
        ? hotels.map((hotel) => (
            <HotelTimes key={hotel.id} hotel={hotel} showName={hotels.length > 1} />
          ))
        : null}

      <h2 className="font-display text-ink-900 mt-10 text-2xl">{t('title')}</h2>
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
                <li key={room.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
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
                  </div>
                  {room.id ? (
                    <OpenDates
                      roomTypeId={room.id}
                      total={room.rooms}
                      periods={room.periods}
                      today={today}
                    />
                  ) : null}
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
                  {roomOptionLabel(view, locale)}
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
                  {roomOptionLabel(amenity, locale)}
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

/** A hotel's check-in and check-out times, saved through /booking/hotel-times. */
function HotelTimes({ hotel, showName }: { hotel: ManagedHotel; showName: boolean }) {
  const t = useTranslations('partnerRooms')
  const [checkIn, setCheckIn] = useState(hotel.checkIn)
  const [checkOut, setCheckOut] = useState(hotel.checkOut)
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'error'>('idle')

  async function save() {
    setState('busy')
    const response = await fetch('/booking/hotel-times', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ business: hotel.id, checkInTime: checkIn, checkOutTime: checkOut }),
    }).catch(() => null)
    setState(response?.ok ? 'saved' : 'error')
  }

  return (
    <section className="border-ink-100 mt-10 border p-5">
      <h2 className="font-display text-ink-900 text-2xl">
        {t('hotelTimes')}
        {showName ? ` · ${hotel.name}` : ''}
      </h2>
      <p className="text-ink-500 mt-1 text-sm">{t('hotelTimesHint')}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block">
          <span className={LABEL}>{t('checkIn')}</span>
          <input
            type="time"
            className={`${INPUT} mt-1`}
            value={checkIn}
            onChange={(e) => {
              setCheckIn(e.target.value)
              setState('idle')
            }}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{t('checkOut')}</span>
          <input
            type="time"
            className={`${INPUT} mt-1`}
            value={checkOut}
            onChange={(e) => {
              setCheckOut(e.target.value)
              setState('idle')
            }}
          />
        </label>
        <button type="button" className={PRIMARY_BUTTON} disabled={state === 'busy'} onClick={save}>
          {state === 'busy' ? t('saving') : t('save')}
        </button>
      </div>
      {state === 'saved' ? <p className={`${NOTICE_SUCCESS} mt-3`}>{t('saved')}</p> : null}
      {state === 'error' ? <p className={`${NOTICE_ERROR} mt-3`}>{t('error')}</p> : null}
    </section>
  )
}

/**
 * The nights a room type is open, and how many of its rooms are sold on them.
 * Closed on every night not listed here (decided 17 November 2026).
 */
function OpenDates({
  roomTypeId,
  total,
  periods,
  today,
}: {
  roomTypeId: number
  total: number
  periods: ManagedRoomType['periods']
  today: string
}) {
  const t = useTranslations('partnerRooms')
  const router = useRouter()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rooms, setRooms] = useState(total)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add() {
    if (!from || !to) return
    setBusy(true)
    setError(null)
    const response = await fetch('/api/room-availability', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ roomType: roomTypeId, startsOn: from, endsOn: to, rooms }),
    }).catch(() => null)
    setBusy(false)
    if (!response?.ok) {
      const json = (await response?.json().catch(() => null)) as {
        errors?: { message?: string }[]
      } | null
      setError(json?.errors?.[0]?.message ?? t('error'))
      return
    }
    setFrom('')
    setTo('')
    router.refresh()
  }

  async function remove(id: number) {
    const response = await fetch(`/api/room-availability/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    }).catch(() => null)
    if (response?.ok) router.refresh()
    else setError(t('error'))
  }

  return (
    <div className="bg-surface-raised mt-3 p-3">
      <p className={LABEL}>{t('openDates')}</p>
      {periods.length === 0 ? (
        <p className="text-state-danger mt-1 text-sm">{t('noDates')}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {periods.map((period) => (
            <li key={period.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-ink-900" dir="ltr">
                {period.startsOn} → {period.endsOn}
              </span>
              <span className="text-ink-700">
                {period.rooms === 0 ? t('closedPeriod') : t('roomsOpen', { rooms: period.rooms })}
              </span>
              <button
                type="button"
                className="text-state-danger min-h-[44px] px-2"
                onClick={() => remove(period.id)}
              >
                {t('removeDates')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_7rem_auto] sm:items-end">
        <label className="block">
          <span className={LABEL}>{t('firstNight')}</span>
          <input
            type="date"
            min={today}
            className={`${INPUT} mt-1`}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{t('lastNight')}</span>
          <input
            type="date"
            min={from || today}
            className={`${INPUT} mt-1`}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{t('roomsToSell')}</span>
          <input
            type="number"
            min={0}
            max={total}
            className={`${INPUT} mt-1`}
            value={rooms}
            onChange={(e) => setRooms(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          className={SECONDARY_BUTTON}
          disabled={busy || !from || !to}
          onClick={add}
        >
          {t('openThese')}
        </button>
      </div>
      <p className={HINT}>{t('openDatesHint')}</p>
      {error ? <p className={`${NOTICE_ERROR} mt-2`}>{error}</p> : null}
    </div>
  )
}
