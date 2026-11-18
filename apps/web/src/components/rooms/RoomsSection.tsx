'use client'

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import type { Locale } from '@vardenia/i18n'
import { Link, usePathname } from '../../i18n/routing'
import { trackEvent } from '../../lib/analytics'
import { newAttemptId } from '../../lib/booking-form'
import { beirutInstant, addDays } from '../../lib/beirut'
import type { RoomTypeView } from '../../lib/room-display'
import {
  INPUT,
  LABEL,
  LINK,
  NOTICE_ERROR,
  NOTICE_INFO,
  NOTICE_SUCCESS,
  PRIMARY_BUTTON,
} from '../formStyles'

/**
 * A hotel's rooms, Booking.com style (17 November 2026): dates and guests at
 * the top, one row per room type with what it is and how many are left, and a
 * number of rooms to pick for each of its options. One request for everything
 * picked. Deliberately plain for now.
 *
 * The page is prerendered, so the rooms left are asked for here, live, from
 * /booking/rooms. Dates, nights and guests arrive filled in from the directory
 * search (?date=&nights=&party=, plus breakfast, cancel and view filters).
 */

interface Props {
  businessId: number
  rooms: RoomTypeView[]
  locale: Locale
  earliestDate: string
  latestDate: string
  checkInTime: string
  checkOutTime: string
  autoConfirm: boolean
}

type Kind = 'all' | 'room' | 'suite'

const MAX_NIGHTS = 30

const noSubscribe = () => () => {}

export function RoomsSection({
  businessId,
  rooms,
  locale,
  earliestDate,
  latestDate,
  checkInTime,
  checkOutTime,
  autoConfirm,
}: Props) {
  const t = useTranslations('rooms')
  const tb = useTranslations('booking')
  const common = useTranslations('common')
  const pathname = usePathname()
  const dateFieldId = useId()

  /**
   * Filled in from the directory search. Read from the address without an
   * effect: the server renders the defaults, the browser the query's values,
   * and a field the guest has changed keeps the guest's value.
   */
  const search = useSyncExternalStore(
    noSubscribe,
    () => window.location.search,
    () => '',
  )
  const fromQuery = (() => {
    const q = new URLSearchParams(search)
    const d = q.get('date')
    const n = Number(q.get('nights'))
    const p = Number(q.get('party'))
    const c = Number(q.get('children'))
    const r = Number(q.get('rooms'))
    return {
      date: d && d >= earliestDate && d <= latestDate ? d : '',
      nights: Number.isInteger(n) && n >= 1 && n <= MAX_NIGHTS ? n : 1,
      // Adults and children apart, as on the Stay search (18 November 2026).
      adults: Number.isInteger(p) && p >= 1 && p <= 50 ? p : 2,
      children: Number.isInteger(c) && c >= 0 && c <= 20 ? c : 0,
      // How many rooms the guest wants, a guide for picking (18 November 2026).
      roomsWanted: Number.isInteger(r) && r >= 1 && r <= 10 ? r : 1,
      breakfast: q.get('breakfast') === '1',
      freeCancel: q.get('cancel') === '1',
      seaView: q.get('view') === 'sea',
    }
  })()

  const [chosen, setChosen] = useState<Partial<typeof fromQuery>>({})
  const { date, nights, adults, children, roomsWanted, breakfast, freeCancel, seaView } = {
    ...fromQuery,
    ...chosen,
  }
  const guests = adults + children
  const choose_ = <K extends keyof typeof fromQuery>(key: K, value: (typeof fromQuery)[K]) =>
    setChosen((current) => ({ ...current, [key]: value }))
  const setDate = (value: string) => {
    choose_('date', value)
    setError(null)
  }
  const setNights = (value: number) => choose_('nights', value)
  const setAdults = (value: number) => choose_('adults', value)
  const setChildren = (value: number) => choose_('children', value)
  const setRoomsWanted = (value: number) => choose_('roomsWanted', value)
  const setBreakfast = (value: boolean) => choose_('breakfast', value)
  const setFreeCancel = (value: boolean) => choose_('freeCancel', value)
  const setSeaView = (value: boolean) => choose_('seaView', value)
  const [kind, setKind] = useState<Kind>('all')

  /** option id -> rooms picked */
  const [picked, setPicked] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signIn, setSignIn] = useState<'signed-out' | 'unverified' | null>(null)
  const [done, setDone] = useState<{ reference: string; status: string; email: string } | null>(
    null,
  )
  const attempt = useRef<{ key: string; id: string } | null>(null)

  // Rooms left for the chosen dates, kept with the question they answer.
  const question = date
    ? new URLSearchParams({
        business: String(businessId),
        date,
        nights: String(nights),
        guests: String(guests),
        locale,
      }).toString()
    : ''
  const [answer, setAnswer] = useState<{
    question: string
    left: Map<number, number>
    nights: Map<number, { night: string; free: number }[]>
    message: string | null
  } | null>(null)
  const current = answer && answer.question === question ? answer : null
  const left = current?.left ?? null
  const nightsBy = current?.nights ?? null
  const checking = Boolean(question) && !current
  const dateProblem = current?.message ?? null

  useEffect(() => {
    if (!question) return
    const controller = new AbortController()
    fetch(`/booking/rooms?${question}`, { signal: controller.signal })
      .then((response) => response.json())
      .then(
        (body: {
          message?: string
          types?: { id: number; left: number; nights?: { night: string; free: number }[] }[]
        }) =>
          setAnswer({
            question,
            left: new Map((body.types ?? []).map((type) => [type.id, type.left])),
            nights: new Map((body.types ?? []).map((type) => [type.id, type.nights ?? []])),
            message: body.message ?? null,
          }),
      )
      .catch(() => {})
    return () => controller.abort()
  }, [question])

  const visible = rooms.filter(
    (room) =>
      (kind === 'all' || room.kind === kind) &&
      (!seaView || room.views.includes('sea')) &&
      room.options.some(
        (option) =>
          (!breakfast || option.breakfast) && (!freeCancel || option.cancellation === 'free'),
      ),
  )

  const lines = rooms.flatMap((room) =>
    room.options.flatMap((option) => {
      const count = picked[`${room.id}:${option.id}`] ?? 0
      return count > 0 ? [{ room, option, count }] : []
    }),
  )
  const totalRooms = lines.reduce((sum, line) => sum + line.count, 0)
  const totalSleeps = lines.reduce(
    (sum, line) => sum + line.count * (line.room.sleepsAdults + line.room.sleepsChildren),
    0,
  )
  // Adults need adult places; children may use either (18 November 2026).
  const adultSleeps = lines.reduce((sum, line) => sum + line.count * line.room.sleepsAdults, 0)
  const tooSmall = totalSleeps < guests || adultSleeps < adults

  const pickedOfType = (roomId: number) =>
    rooms
      .find((room) => room.id === roomId)
      ?.options.reduce((sum, option) => sum + (picked[`${roomId}:${option.id}`] ?? 0), 0) ?? 0

  function choose(roomId: number, optionId: string, count: number) {
    setPicked((current) => ({ ...current, [`${roomId}:${optionId}`]: count }))
    setError(null)
  }

  async function submit() {
    if (totalRooms === 0) return
    if (!date) {
      // Rooms can be picked before dates; the dates are asked for here.
      setError(t('pickDates'))
      document.getElementById(dateFieldId)?.focus()
      return
    }
    setBusy(true)
    setError(null)
    setSignIn(null)
    const start = beirutInstant(date, checkInTime)
    const end = beirutInstant(addDays(date, nights), checkOutTime)
    if (!start || !end) {
      setBusy(false)
      return
    }
    const details = {
      business: businessId,
      start: start.toISOString(),
      end: end.toISOString(),
      partySize: guests,
      children,
      locale,
      rooms: lines.map((line) => ({
        roomType: line.room.id,
        count: line.count,
        option: line.option.id,
      })),
    }
    const key = JSON.stringify(details)
    if (attempt.current?.key !== key) attempt.current = { key, id: newAttemptId() }
    try {
      const response = await fetch('/booking/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...details, requestId: attempt.current.id }),
      })
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean
        reference?: string
        status?: string
        email?: string
        message?: string
      } | null
      if (response.ok && body?.ok && body.reference) {
        attempt.current = null
        setDone({
          reference: body.reference,
          status: body.status ?? 'pending',
          email: body.email ?? '',
        })
        setPicked({})
        trackEvent('booking-requested', { status: body.status ?? 'pending' })
        return
      }
      if (response.status === 401) return setSignIn('signed-out')
      if (response.status === 403) return setSignIn('unverified')
      setError(body?.message ?? common('error'))
    } catch {
      setError(common('error'))
    } finally {
      setBusy(false)
    }
  }

  const chip = (active: boolean) =>
    `border px-3 py-2 text-sm ${active ? 'border-ink-900 bg-ink-900 text-surface-base' : 'border-ink-100 text-ink-900 hover:border-ink-300'}`

  if (done) {
    const confirmed = done.status === 'confirmed'
    return (
      <section id="rooms" className="mt-14 scroll-mt-24">
        <div className={NOTICE_SUCCESS} role="status">
          <p className="font-semibold">{confirmed ? tb('confirmedTitle') : tb('pendingTitle')}</p>
          <p className="mt-1">
            {confirmed
              ? tb('confirmedBody', { email: done.email })
              : tb('pendingBody', { email: done.email })}
          </p>
          <p className="mt-4 text-xs uppercase tracking-wider">{tb('reference')}</p>
          <p className="font-mono text-2xl" dir="ltr">
            {done.reference}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section id="rooms" className="mt-14 scroll-mt-24" aria-labelledby="rooms-heading">
      <h2 id="rooms-heading" className="font-display text-ink-900 text-2xl">
        {t('heading')}
      </h2>
      <p className="text-ink-500 mt-1 text-sm" dir="auto">
        {t('times', { in: checkInTime, out: checkOutTime })}
      </p>

      <div className="border-ink-100 bg-surface-raised mt-5 grid gap-4 border p-4 sm:grid-cols-3">
        <label className="block">
          <span className={LABEL}>{t('checkIn')}</span>
          <input
            id={dateFieldId}
            type="date"
            className={`${INPUT} mt-1`}
            value={date}
            min={earliestDate}
            max={latestDate}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{tb('nights')}</span>
          <select
            className={`${INPUT} mt-1`}
            value={nights}
            onChange={(event) => setNights(Number(event.target.value))}
          >
            {Array.from({ length: MAX_NIGHTS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {tb('nightCount', { count: n })}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className={LABEL}>{t('adults')}</span>
            <input
              type="number"
              min={1}
              max={50}
              className={`${INPUT} mt-1`}
              value={adults}
              onChange={(event) =>
                setAdults(Math.max(1, Math.min(50, Number(event.target.value) || 1)))
              }
            />
          </label>
          <label className="block">
            <span className={LABEL}>{t('children')}</span>
            <input
              type="number"
              min={0}
              max={20}
              className={`${INPUT} mt-1`}
              value={children}
              onChange={(event) =>
                setChildren(Math.max(0, Math.min(20, Number(event.target.value) || 0)))
              }
            />
          </label>
          <label className="block">
            <span className={LABEL}>{t('roomsField')}</span>
            <input
              type="number"
              min={1}
              max={10}
              className={`${INPUT} mt-1`}
              value={roomsWanted}
              onChange={(event) =>
                setRoomsWanted(Math.max(1, Math.min(10, Number(event.target.value) || 1)))
              }
            />
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(['all', 'room', 'suite'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            className={chip(kind === value)}
            onClick={() => setKind(value)}
          >
            {value === 'all'
              ? t('filterAll')
              : value === 'room'
                ? t('filterRooms')
                : t('filterSuites')}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={breakfast}
          className={chip(breakfast)}
          onClick={() => setBreakfast(!breakfast)}
        >
          {t('filterBreakfast')}
        </button>
        <button
          type="button"
          aria-pressed={freeCancel}
          className={chip(freeCancel)}
          onClick={() => setFreeCancel(!freeCancel)}
        >
          {t('filterFreeCancel')}
        </button>
        <button
          type="button"
          aria-pressed={seaView}
          className={chip(seaView)}
          onClick={() => setSeaView(!seaView)}
        >
          {t('filterSeaView')}
        </button>
      </div>

      <p className="text-ink-500 mt-4 text-sm" aria-live="polite">
        {!date ? t('pickDates') : checking ? t('checking') : (dateProblem ?? '')}
      </p>

      {visible.length === 0 ? (
        <p className="text-ink-500 mt-6">{t('noMatch')}</p>
      ) : (
        <ul className="mt-4 space-y-6">
          {visible.map((room) => {
            const roomLeft = left?.get(room.id)
            const free = roomLeft === undefined ? null : Math.max(0, roomLeft)
            // Nothing can be picked before a check-in date (18 November 2026):
            // only then is it known which rooms are free.
            const capacity = date ? (free ?? 0) : 0
            const remaining = Math.max(0, capacity - pickedOfType(room.id))
            return (
              <li key={room.id} className="border-ink-100 border">
                <div className="grid gap-4 p-4 sm:grid-cols-[220px_1fr]">
                  <RoomPhotos room={room} prev={t('prev')} next={t('next')} />
                  <div>
                    <h3 className="font-display text-ink-900 text-xl">{room.name}</h3>
                    <p className="text-ink-500 mt-1 text-sm">
                      {[
                        room.sleepsChildren > 0
                          ? t('sleepsChildren', {
                              adults: room.sleepsAdults,
                              children: room.sleepsChildren,
                            })
                          : t('sleeps', { adults: room.sleepsAdults }),
                        room.beds,
                        room.sizeM2 ? t('size', { size: room.sizeM2 }) : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {room.views.length + room.amenities.length > 0 ? (
                      <p className="text-ink-700 mt-2 text-sm">
                        {[
                          ...room.views.map((view) => t(`views.${view}` as never)),
                          ...room.amenities.map((amenity) => t(`amenities.${amenity}` as never)),
                        ].join(' · ')}
                      </p>
                    ) : null}
                    {room.description ? (
                      <p className="text-ink-700 mt-3 whitespace-pre-line text-sm">
                        {room.description}
                      </p>
                    ) : null}
                    {free !== null ? (
                      <p
                        className={`mt-3 text-sm font-semibold ${free === 0 ? 'text-state-danger' : 'text-ink-900'}`}
                      >
                        {free === 0 ? t('soldOut') : t('left', { count: free })}
                      </p>
                    ) : !date ? (
                      <p className="text-ink-900 mt-3 text-sm font-semibold">{t('pickDates')}</p>
                    ) : null}
                    {/* Whether the group fits in the rooms asked for, all of this
                        type: adults in adult places, everyone in the total. */}
                    {room.sleepsAdults * roomsWanted < adults ||
                    (room.sleepsAdults + room.sleepsChildren) * roomsWanted < guests ? (
                      <p className="text-ink-500 mt-1 text-sm">
                        {t('tooSmallFor', { rooms: roomsWanted })}
                      </p>
                    ) : null}
                    <NightLine
                      nights={nightsBy?.get(room.id) ?? []}
                      locale={locale}
                      wholeStayFree={free ?? 0}
                    />
                  </div>
                </div>

                <ul className="border-ink-100 divide-ink-100 divide-y border-t">
                  {room.options
                    .filter(
                      (option) =>
                        (!breakfast || option.breakfast) &&
                        (!freeCancel || option.cancellation === 'free'),
                    )
                    .map((option) => {
                      const id = `${room.id}:${option.id}`
                      const current = picked[id] ?? 0
                      const max = current + remaining
                      return (
                        <li
                          key={option.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="text-sm">
                            <p className="text-ink-900">
                              {option.breakfast ? t('breakfast') : t('roomOnly')}
                            </p>
                            <p className="text-ink-500">
                              {option.cancellation === 'non-refundable'
                                ? t('nonRefundable')
                                : option.freeCancellationDays
                                  ? t('freeCancelUntil', { days: option.freeCancellationDays })
                                  : t('freeCancel')}
                              {' · '}
                              {option.payment === 'in-advance'
                                ? t('payInAdvance')
                                : t('payAtProperty')}
                            </p>
                          </div>
                          <label className="flex items-center gap-2 text-sm">
                            <span className="text-ink-500">{t('quantity')}</span>
                            <select
                              className="border-ink-100 bg-surface-base min-h-[44px] border px-2"
                              value={current}
                              disabled={max === 0}
                              onChange={(event) =>
                                choose(room.id, option.id, Number(event.target.value))
                              }
                            >
                              {Array.from({ length: Math.max(0, max) + 1 }, (_, n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </label>
                        </li>
                      )
                    })}
                </ul>
              </li>
            )
          })}
        </ul>
      )}

      {totalRooms > 0 ? (
        <div className="border-ink-100 bg-surface-raised sticky bottom-0 mt-6 border p-4">
          <p className="text-ink-900 font-semibold">
            {totalRooms === roomsWanted
              ? t('selected', { count: totalRooms })
              : t('selectedOf', { count: totalRooms, wanted: roomsWanted })}
          </p>
          {tooSmall ? (
            <p className="text-state-danger mt-1 text-sm">
              {totalSleeps < guests
                ? t('tooManyGuests', { sleeps: totalSleeps, guests })
                : t('tooManyGuests', { sleeps: adultSleeps, guests: adults })}
            </p>
          ) : null}
          <button
            type="button"
            className={`${PRIMARY_BUTTON} mt-3`}
            disabled={busy || tooSmall}
            onClick={submit}
          >
            {busy ? tb('submitting') : autoConfirm ? t('book') : t('request')}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className={`${NOTICE_ERROR} mt-4`} role="alert">
          {error}
        </p>
      ) : null}

      {signIn ? (
        <div className={`${NOTICE_INFO} mt-4`} role="alert">
          <p>{signIn === 'unverified' ? tb('verifyFirst') : tb('accountRequired')}</p>
          <div className="mt-3 flex flex-wrap gap-4">
            {signIn === 'signed-out' ? (
              <Link
                href={{ pathname: '/account/signup', query: { next: pathname } }}
                className={LINK}
              >
                {tb('accountCreate')}
              </Link>
            ) : null}
            <Link href={{ pathname: '/account/login', query: { next: pathname } }} className={LINK}>
              {tb('accountSignIn')}
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function RoomPhotos({ room, prev, next }: { room: RoomTypeView; prev: string; next: string }) {
  const [index, setIndex] = useState(0)
  const photo = room.photos[index]
  if (!photo) return <div className="bg-surface-sunken aspect-[4/3] w-full" aria-hidden />
  return (
    <div className="relative">
      <div className="bg-surface-sunken relative aspect-[4/3] w-full overflow-hidden">
        <Image
          src={photo.src}
          alt={photo.alt || room.name}
          fill
          sizes="(min-width: 640px) 220px, 100vw"
          className="object-cover"
        />
      </div>
      {room.photos.length > 1 ? (
        <div className="mt-2 flex justify-between text-sm">
          <button
            type="button"
            className="text-ink-700 min-h-[44px] px-2"
            aria-label={prev}
            onClick={() => setIndex((index - 1 + room.photos.length) % room.photos.length)}
          >
            ‹
          </button>
          <span className="text-ink-500 self-center" dir="ltr">
            {index + 1} / {room.photos.length}
          </span>
          <button
            type="button"
            className="text-ink-700 min-h-[44px] px-2"
            aria-label={next}
            onClick={() => setIndex((index + 1) % room.photos.length)}
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Night by night, when the nights differ: "13 Dec: 4 free · 14 to 19 Dec: 5
 * free", and "Free from 14 Dec" when the whole stay does not fit but its end
 * does. Hidden when every night has the same number, which "N left" says.
 */
function NightLine({
  nights,
  locale,
  wholeStayFree,
}: {
  nights: { night: string; free: number }[]
  locale: Locale
  wholeStayFree: number
}) {
  const t = useTranslations('rooms')
  if (nights.length < 2 || nights.every((n) => n.free === nights[0]?.free)) return null

  const day = (night: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(`${night}T12:00:00Z`),
    )

  const groups: { from: string; to: string; free: number }[] = []
  for (const { night, free } of nights) {
    const last = groups[groups.length - 1]
    if (last && last.free === free) last.to = night
    else groups.push({ from: night, to: night, free })
  }

  const lastClosed = nights.map((n) => n.free).lastIndexOf(0)
  const freeFrom =
    wholeStayFree === 0 && lastClosed >= 0 && lastClosed < nights.length - 1
      ? nights[lastClosed + 1]?.night
      : undefined

  return (
    <div className="text-ink-500 mt-2 text-sm">
      <p>
        {groups
          .map((group) =>
            group.from === group.to
              ? t('nightOne', { date: day(group.from), count: group.free })
              : t('nightRange', { from: day(group.from), to: day(group.to), count: group.free }),
          )
          .join(' · ')}
      </p>
      {freeFrom ? (
        <p className="text-ink-900 mt-1">{t('freeFrom', { date: day(freeFrom) })}</p>
      ) : null}
    </div>
  )
}
