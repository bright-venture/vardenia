'use client'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../../i18n/routing'
import { useDiscoveryRoute, useJourneyMotion } from './browser-state'
import { Coordinates } from './Coordinates'
import { GeographicMap } from './GeographicMap'
import { mapPosition } from './map-projection'
import { useCityAutoplay } from './useCityAutoplay'
import {
  DESTINATIONS,
  directoryFor,
  matchesFeeling,
  routePath,
  type Destination,
  type Feeling,
} from './destinations'
const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n))
const assets = '/journey/'
export function CinematicJourney({
  locale,
  directory,
  connection,
  magazine,
}: {
  locale: Locale
  directory: ReactNode
  connection: ReactNode
  magazine: ReactNode
}) {
  const t = useTranslations('journey'),
    root = useRef<HTMLDivElement>(null),
    film = useRef<HTMLVideoElement>(null)
  const userPaused = useRef(false)
  const postcards = useRef<HTMLDivElement>(null)
  const [motion, toggleMotion] = useJourneyMotion(),
    [playing, setPlaying] = useState(false),
    [failed, setFailed] = useState(false)
  const [feeling, setFeeling] = useState<Feeling>('all'),
    [active, setActive] = useState<string>('byblos'),
    [selection, setSelection] = useState('all')
  const [cityIndex, setCityIndex] = useState(3)
  const cityRoot = useRef<HTMLElement>(null)
  const [cityHover, setCityHover] = useState(false)
  const [cityFocus, setCityFocus] = useState(false)
  const advanceCity = useCallback(() => {
    setCityIndex((old) => (old + 1) % DESTINATIONS.length)
  }, [])
  useCityAutoplay(cityRoot, motion && !cityHover && !cityFocus, advanceCity, cityIndex)
  const city = DESTINATIONS[cityIndex]!
  const [trip, setTrip] = useDiscoveryRoute(),
    [flipped, setFlipped] = useState<string[]>([]),
    [pointerMotion, setPointerMotion] = useState(true)
  const ar = locale === 'ar',
    name = (p: Destination) => (ar ? p.ar : p.name),
    region = (p: Destination) => (ar ? p.regionAr : p.region)
  const body = (p: Destination) => t(`${p.id}Body` as 'byblosBody')
  const shown = DESTINATIONS.filter((p) => matchesFeeling(p, feeling))
  const available = shown.filter((p) => selection === 'all' || p.where === selection)
  const place = available.find((p) => p.id === active) || available[0]
  useEffect(() => {
    const el = film.current
    if (!el) return
    let inView = false,
      cancelled = false
    const play = () => {
      if (motion && !failed && inView && !document.hidden && !userPaused.current)
        void el.play().catch(() => {
          if (!cancelled) setPlaying(false)
        })
      else el.pause()
    }
    const observer = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? false
        play()
      },
      { threshold: 0.15 },
    )
    observer.observe(el)
    document.addEventListener('visibilitychange', play)
    return () => {
      cancelled = true
      observer.disconnect()
      document.removeEventListener('visibilitychange', play)
      el.pause()
    }
  }, [motion, failed])
  useEffect(() => {
    const host = root.current
    if (!host) return
    const hero = host.querySelector<HTMLElement>('.vd-hero')!,
      heroTrack = host.querySelector<HTMLElement>('.vd-hero-track')!,
      landscape = host.querySelector<HTMLElement>('.vd-landscape')!,
      path = host.querySelector<SVGPathElement>('.vd-route-progress')!,
      pin = host.querySelector<SVGSVGElement>('.vd-journey-pin')!,
      route = host.querySelector<SVGSVGElement>('.vd-route')!
    let frame = 0,
      dirty = true,
      stops: { at: number; radius: number }[] = [],
      box = { x: 0, y: 0, width: 1, height: 1 }
    const length = path.getTotalLength()
    path.style.strokeDasharray = String(length)
    const measure = () => {
      const r = route.getBoundingClientRect(),
        p = landscape.getBoundingClientRect(),
        den = Math.max(1, landscape.offsetHeight - 380)
      box = { x: r.left - p.left, y: r.top - p.top, width: r.width, height: r.height }
      const positions = [...host.querySelectorAll<HTMLElement>('.vd-scene-photo')]
        .map((el) => {
          let y = 0,
            node: HTMLElement | null = el
          while (node && node !== landscape) {
            y += node.offsetTop
            node = node.offsetParent as HTMLElement | null
          }
          return clamp((y + el.offsetHeight * 0.5 + innerHeight * 0.15 - 240) / den)
        })
        .filter((p) => p > 0.03 && p < 0.97)
        .sort((a, b) => a - b)
      stops = positions.map((at, i) => ({
        at,
        radius: Math.min(
          0.045,
          (at - (positions[i - 1] ?? 0)) * 0.3,
          ((positions[i + 1] ?? 1) - at) * 0.3,
        ),
      }))
      dirty = false
    }
    const update = () => {
      frame = 0
      if (dirty) measure()
      const h = innerWidth < 701 ? 70 : 80,
        hr = heroTrack.getBoundingClientRect(),
        p = motion
          ? clamp((h - hr.top) / Math.max(1, heroTrack.offsetHeight - hero.offsetHeight))
          : 0
      hero.style.setProperty('--vd-copy-out', String(clamp((p - 0.08) / 0.38)))
      hero.style.setProperty('--vd-bridge-in', String(clamp((p - 0.45) / 0.35)))
      hero.style.setProperty('--vd-film-scale', String(1 + p * 0.07))
      const copy = hero.querySelector<HTMLElement>('.vd-hero-copy')!,
        bridge = hero.querySelector<HTMLElement>('.vd-hero-bridge')!
      copy.inert = p > 0.45
      bridge.inert = p < 0.65
      bridge.setAttribute('aria-hidden', String(p < 0.65))
      const lr = landscape.getBoundingClientRect()
      let progress = motion
        ? clamp((innerHeight * 0.65 - lr.top - 240) / Math.max(1, landscape.offsetHeight - 380))
        : 1
      const stop = stops.find((s) => Math.abs(progress - s.at) < s.radius)
      if (stop) {
        const d = progress - stop.at,
          u = d / stop.radius
        progress -= d * (1 - u * u) ** 2
      }
      path.style.strokeDashoffset = String(length * (1 - progress))
      const point = path.getPointAtLength(length * progress)
      pin.style.transform = `translate(${box.x + (point.x / 1000) * box.width}px,${box.y + (point.y / 2400) * box.height}px) translate(-50%,-95.2381%)`
      host.querySelectorAll<HTMLElement>('[data-vd-parallax]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.bottom < -200 || r.top > innerHeight + 200) return
        const shift = motion
          ? clamp((innerHeight * 0.5 - r.top - r.height * 0.5) / innerHeight, -1, 1) *
            Number(el.dataset.vdParallax)
          : 0
        el.style.setProperty('--vd-photo-travel', `${shift}px`)
      })
    }
    const schedule = () => {
        if (!frame) frame = requestAnimationFrame(update)
      },
      resize = () => {
        dirty = true
        schedule()
      }
    const reveals = [...host.querySelectorAll<HTMLElement>('[data-vd-reveal]')]
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.remove('vd-pending')
            observer.unobserve(e.target)
          }
        }),
      { threshold: 0.08 },
    )
    if (motion)
      reveals.forEach((el, i) => {
        if (el.getBoundingClientRect().top > innerHeight) {
          el.classList.add('vd-reveal', 'vd-pending')
          el.style.transitionDelay = (i % 3) * 65 + 'ms'
        }
        observer.observe(el)
      })
    else reveals.forEach((el) => el.classList.remove('vd-pending'))
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', resize)
    window.addEventListener('load', resize)
    const observerSize = new ResizeObserver(resize)
    observerSize.observe(landscape)
    void document.fonts.ready.then(resize)
    update()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      observerSize.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', resize)
      window.removeEventListener('load', resize)
      reveals.forEach((el) => el.classList.remove('vd-pending'))
    }
  }, [motion])
  const cycle = (direction: number, pointer: boolean) => {
    setPointerMotion(pointer)
    const i = available.findIndex((p) => p.id === place?.id)
    const next = available[(i + direction + available.length) % available.length]
    if (next) setActive(next.id)
  }
  const move = (id: string, direction: number) =>
    setTrip((old) => {
      const i = old.indexOf(id),
        j = i + direction
      if (j < 0 || j >= old.length) return old
      const next = [...old]
      const previous = next[i]!
      next[i] = next[j]!
      next[j] = previous
      return next
    })
  const exportRoute = () => {
    const text = [
      'MY VARDENIA DISCOVERY ROUTE',
      '',
      ...trip.flatMap((id, i) => {
        const p = DESTINATIONS.find((p) => p.id === id)!
        return [
          `${i + 1}. ${name(p)}`,
          `${location.origin}/${locale === 'en' ? '' : locale + '/'}directory?where=${p.where}`,
          '',
        ]
      }),
      t('routeNote'),
    ].join('\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'My-Vardenia-Route.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  const scenePhoto = (id: string, extra: string, shift: number) => {
    const p = DESTINATIONS.find((p) => p.id === id)!
    return (
      <figure className={`vd-scene-photo ${extra}`} data-vd-parallax={shift} data-vd-reveal>
        <div className="vd-scene-image">
          <img
            src={assets + p.image}
            srcSet={`${assets + p.image.replace('.webp', '-m.webp')} 640w, ${assets + p.image} 1600w`}
            sizes="(max-width:700px) calc(100vw - 48px), 60vw"
            alt={p.alt}
            width="1600"
            height="1200"
            loading="lazy"
          />
          <Coordinates place={p} enabled={motion} label={name(p)} />
        </div>
        <figcaption>{name(p)}</figcaption>
      </figure>
    )
  }
  const feelings = [
    ['all', t('all')],
    ['coast', t('coast')],
    ['mountain', t('mountain')],
    ['heritage', t('heritage')],
    ['nature', t('nature')],
    ['villages', t('villages')],
    ['harbours', t('harbours')],
    ['sunsets', t('sunsets')],
  ] as const
  return (
    <div
      ref={root}
      data-vd-pointer={pointerMotion}
      className={`vd-home ${motion ? '' : 'vd-motion-off'}`}
    >
      <section className="vd-hero-track" aria-label={t('heroA')}>
        <div className="vd-hero">
          <div className="vd-hero-media">
            <img
              src={assets + 'byblos.webp'}
              alt="Byblos old harbour"
              width="1600"
              height="1200"
              fetchPriority="high"
            />
            {!failed && (
              <video
                ref={film}
                poster={assets + 'byblos.webp'}
                muted
                autoPlay={motion}
                playsInline
                loop
                preload="auto"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onError={(event) => {
                  /**
                   * Only a real failure hides the film. A <source> the browser
                   * skips because its media query does not match - the phone
                   * cut, on any screen wider than 700px - also fires `error`,
                   * and React hands it up to this handler. Treating that as a
                   * failure removed the film for every desktop visitor while
                   * the desktop source was loading perfectly well. So it counts
                   * only when the video itself errs, or no source is left.
                   */
                  const video = event.currentTarget
                  if (
                    event.target === video ||
                    video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE
                  ) {
                    setFailed(true)
                  }
                }}
                aria-label="Vardenia brand film"
              >
                <source
                  src={assets + 'hero-film-mobile.mp4'}
                  type="video/mp4"
                  media="(max-width:700px)"
                />
                <source src="/hero/hero-film.mp4" type="video/mp4" />
              </video>
            )}
          </div>
          <div className="vd-hero-shade" />
          <div className="vd-hero-copy">
            <h1>
              {t('heroA')}
              <br />
              {t('heroB')}
            </h1>
            <p>{t('heroBody')}</p>
            <a className="vd-button vd-button-light" href="#ways">
              {t('begin')} <span aria-hidden>↗</span>
            </a>
          </div>
          <div className="vd-hero-bridge" aria-hidden>
            <h2>
              {t('bridgeA')}
              <br />
              {t('bridgeB')}
            </h2>
            <div>
              <p>{t('bridgeBody')}</p>
              <a className="vd-button vd-button-light" href="#ways">
                {t('bridgeLink')} ↗
              </a>
            </div>
          </div>
          <details className="vd-film-controls">
            <summary>{t('film')}</summary>
            <div>
              {!failed && (
                <button
                  onClick={() => {
                    const v = film.current
                    if (!v) return
                    if (v.paused) {
                      userPaused.current = false
                      void v.play().catch(() => setFailed(true))
                    } else {
                      userPaused.current = true
                      v.pause()
                    }
                  }}
                >
                  {playing ? t('pause') : t('play')}
                </button>
              )}
              <button aria-pressed={motion} onClick={toggleMotion}>
                {motion ? t('motionOn') : t('motionOff')}
              </button>
            </div>
          </details>
          <a className="vd-hero-next" href="#ways" aria-label={t('begin')}>
            ↓
          </a>
        </div>
      </section>
      <section className="vd-landscape" id="ways" aria-labelledby="vd-ways-title">
        <div className="vd-landscape-map">
          <GeographicMap />
        </div>
        <svg className="vd-route" viewBox="0 0 1000 2400" preserveAspectRatio="none" aria-hidden>
          <path className="vd-route-base" d={routePath} />
          <path className="vd-route-progress" d={routePath} />
        </svg>
        <svg className="vd-journey-pin" viewBox="-16 -40 32 42" aria-hidden>
          <path d="M0 0C-3-6-14-16-14-24a14 14 0 1 1 28 0C14-16 3-6 0 0Z" />
          <circle cx="0" cy="-24" r="5" />
        </svg>
        <div className="vd-journey-intro">
          <h2 id="vd-ways-title" data-vd-reveal>
            {t('introA')}
            <br />
            {t('introB')}
          </h2>
          <p data-vd-reveal>{t('introBody')}</p>
        </div>
        <div className="vd-trip-scene vd-coast-scene">
          {scenePhoto('byblos', 'vd-photo-coast', 18)}
          <div className="vd-scene-copy">
            <h3 data-vd-reveal>
              {t('coastA')}
              <br />
              {t('coastB')}
            </h3>
            <p data-vd-reveal>{t('coastBody')}</p>
            <a
              className="vd-button"
              href="#destinations"
              onClick={() => {
                setFeeling('coast')
                setSelection('all')
              }}
            >
              {t('coastLink')} ↗
            </a>
          </div>
          {scenePhoto('beirut', 'vd-photo-city', -12)}
        </div>
        <div className="vd-trip-scene vd-mountain-scene">
          <div className="vd-scene-copy">
            <h3 data-vd-reveal>
              {t('mountainA')}
              <br />
              {t('mountainB')}
            </h3>
            <p data-vd-reveal>{t('mountainBody')}</p>
            <a
              className="vd-button"
              href="#destinations"
              onClick={() => {
                setFeeling('mountain')
                setSelection('all')
              }}
            >
              {t('mountainLink')} ↗
            </a>
          </div>
          {scenePhoto('bsharri', 'vd-photo-mountain', 20)}
          {scenePhoto('deir-el-qamar', 'vd-photo-village', -10)}
        </div>
        <p className="vd-journey-outro" data-vd-reveal>
          {t('outro')}
          <br />
          <a href="#stone" aria-label={t('citySlider')}>
            ↓
          </a>
        </p>
      </section>
      <section
        ref={cityRoot}
        className="vd-stone vd-city-slider"
        id="stone"
        aria-label={t('citySlider')}
        aria-roledescription="carousel"
        data-city-motion={motion}
        onPointerDownCapture={() => setCityFocus(false)}
        onFocusCapture={(event) => setCityFocus(event.target.matches(':focus-visible'))}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setCityFocus(false)
        }}
      >
        <div className="vd-stone-image vd-city-images" aria-hidden>
          {DESTINATIONS.map((p) => (
            <img
              key={p.id}
              className={p.id === city.id ? 'vd-city-current' : ''}
              src={assets + p.image}
              srcSet={`${assets + p.image.replace('.webp', '-m.webp')} 640w, ${assets + p.image} 1600w`}
              sizes="100vw"
              alt=""
              width="1600"
              height="1200"
              loading="lazy"
            />
          ))}
        </div>
        <div className="vd-stone-shade" />
        <GeographicMap className="vd-stone-map" />
        <div className="vd-stone-copy" aria-live={cityFocus ? 'polite' : 'off'} aria-atomic="true">
          <h2>{name(city)}</h2>
          <p>{city.id === 'baalbek' ? t('stoneBody') : body(city)}</p>
          <Link
            className="vd-button vd-button-light"
            href={directoryFor(city)}
            onPointerEnter={(event) => {
              if (event.pointerType !== 'touch') setCityHover(true)
            }}
            onPointerLeave={() => setCityHover(false)}
          >
            {t('explore')} ↗
          </Link>
        </div>
        <Coordinates
          key={city.id}
          className="vd-stone-coordinates"
          place={city}
          enabled={motion}
          label={name(city)}
        />
      </section>
      <section className="vd-atlas" id="destinations">
        <div className="vd-section-heading">
          <h2 data-vd-reveal>
            {t('atlasA')}
            <br />
            {t('atlasB')}
          </h2>
          <p data-vd-reveal>{t('atlasBody')}</p>
        </div>
        <div className="vd-destination-stage">
          <div className="vd-destination-images" aria-hidden>
            {DESTINATIONS.map((p) => (
              <img
                key={p.id}
                src={assets + p.image}
                alt=""
                width="1600"
                height="1200"
                loading="lazy"
                className={place?.id === p.id ? 'vd-current' : ''}
              />
            ))}
          </div>
          <div className="vd-destination-shade" />
          <div className="vd-destination-toolbar">
            <div className="vd-feelings" role="group" aria-label={t('atlasB')}>
              {feelings.map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={feeling === key}
                  onClick={(e) => {
                    setPointerMotion(e.detail > 0)
                    setFeeling(key)
                    setSelection('all')
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <label>
              {t('region')}
              <select
                value={selection}
                onChange={(e) => {
                  setSelection(e.target.value)
                  setPointerMotion(false)
                }}
              >
                <option value="all">{t('allRegions')}</option>
                {shown.map((p) => (
                  <option key={p.id} value={p.where}>
                    {region(p)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="vd-destination-map">
            <div
              className="vd-map-pins"
              onClick={(event) => {
                if ((event.target as Element).closest('button')) return
                const box = event.currentTarget.getBoundingClientRect()
                const x = ((event.clientX - box.left) / box.width) * 100
                const y = ((event.clientY - box.top) / box.height) * 100
                const nearest = [...DESTINATIONS].sort((a, b) => {
                  const pa = mapPosition(a),
                    pb = mapPosition(b)
                  return (pa.x - x) ** 2 + (pa.y - y) ** 2 - ((pb.x - x) ** 2 + (pb.y - y) ** 2)
                })[0]!
                setPointerMotion(true)
                setFeeling('all')
                setSelection('all')
                setActive(nearest.id)
              }}
            >
              <GeographicMap />
              {DESTINATIONS.map((p) => (
                <button
                  key={p.id}
                  aria-label={name(p)}
                  aria-pressed={place?.id === p.id}
                  style={{
                    left: mapPosition(p).x + '%',
                    top: mapPosition(p).y + '%',
                  }}
                  onClick={(e) => {
                    setPointerMotion(e.detail > 0)
                    setFeeling('all')
                    setSelection('all')
                    setActive(p.id)
                  }}
                >
                  <span />
                  <span className="vd-map-city-label">{name(p)}</span>
                </button>
              ))}
            </div>
            <p>{t('mapCaption')}</p>
            <a href="#discovery-route">
              {t('routeTitle')} · {trip.length} ↗
            </a>
          </div>
          {place && (
            <div className="vd-atlas-details" key={place.id} aria-live="polite">
              <h3>{region(place)}</h3>
              <p className="vd-destination-name">{name(place)}</p>
              <Coordinates
                place={place}
                enabled={motion && pointerMotion}
                className="vd-destination-coordinates"
              />
              <p className="vd-destination-description">{body(place)}</p>
              <div className="vd-destination-actions">
                <Link className="vd-button vd-button-light" href={directoryFor(place)}>
                  {t('explore')} ↗
                </Link>
                <button
                  className="vd-button vd-button-paper"
                  disabled={trip.includes(place.id)}
                  onClick={() =>
                    setTrip((old) => (old.includes(place.id) ? old : [...old, place.id]))
                  }
                >
                  {trip.includes(place.id) ? t('added') : t('add') + ' +'}
                </button>
              </div>
            </div>
          )}
          <div className="vd-destination-navigation">
            <span aria-live="polite" dir="ltr">
              {place
                ? `${available.findIndex((p) => p.id === place.id) + 1} / ${available.length}`
                : ''}
            </span>
            <div>
              <button
                aria-label={t('previous')}
                disabled={available.length < 2}
                onClick={(e) => cycle(-1, e.detail > 0)}
              >
                ←
              </button>
              <button
                aria-label={t('next')}
                disabled={available.length < 2}
                onClick={(e) => cycle(1, e.detail > 0)}
              >
                →
              </button>
            </div>
          </div>
        </div>
        <section className="vd-trip-panel" id="discovery-route" aria-labelledby="vd-route-title">
          <div className="vd-trip-heading">
            <h3 id="vd-route-title">{t('routeTitle')}</h3>
            <p>{t('routeBody')}</p>
            <span aria-live="polite">
              {trip.length} {t('stops')}
            </span>
          </div>
          {trip.length ? (
            <ol>
              {trip.map((id, i) => {
                const p = DESTINATIONS.find((p) => p.id === id)!
                return (
                  <li key={id}>
                    <img src={assets + p.image} alt="" width="90" height="70" />
                    <Link href={directoryFor(p)}>{name(p)}</Link>
                    <div>
                      <button
                        aria-label={`${t('earlier')} · ${name(p)}`}
                        disabled={i === 0}
                        onClick={() => move(id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`${t('later')} · ${name(p)}`}
                        disabled={i === trip.length - 1}
                        onClick={() => move(id, 1)}
                      >
                        ↓
                      </button>
                      <button
                        aria-label={`${t('remove')} · ${name(p)}`}
                        onClick={() => setTrip((old) => old.filter((x) => x !== id))}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="vd-route-empty">{t('routeEmpty')}</p>
          )}
          <div className="vd-trip-actions">
            <button className="vd-button" disabled={!trip.length} onClick={exportRoute}>
              {t('download')} ↓
            </button>
            <button className="vd-text-button" disabled={!trip.length} onClick={() => setTrip([])}>
              {t('clear')}
            </button>
            <p>{t('routeNote')}</p>
          </div>
        </section>
      </section>
      <section className="vd-detours" id="discover">
        <div className="vd-section-heading">
          <h2 data-vd-reveal>
            {t('detourA')}
            <br />
            {t('detourB')}
          </h2>
          <div>
            <p data-vd-reveal>{t('detourBody')}</p>
            <div className="vd-postcard-controls">
              <button
                type="button"
                aria-label={t('previous')}
                onClick={(event) =>
                  postcards.current?.scrollBy({
                    left: (ar ? 1 : -1) * (postcards.current.clientWidth * 0.85),
                    behavior: motion && event.detail !== 0 ? 'smooth' : 'instant',
                  })
                }
              >
                ←
              </button>
              <button
                type="button"
                aria-label={t('next')}
                onClick={(event) =>
                  postcards.current?.scrollBy({
                    left: (ar ? -1 : 1) * (postcards.current.clientWidth * 0.85),
                    behavior: motion && event.detail !== 0 ? 'smooth' : 'instant',
                  })
                }
              >
                →
              </button>
            </div>
          </div>
        </div>
        <div
          className="vd-postcards"
          ref={postcards}
          tabIndex={0}
          role="region"
          aria-label={t('detourA') + ' ' + t('detourB')}
        >
          {DESTINATIONS.map((p) => {
            const back = flipped.includes(p.id)
            return (
              <article key={p.id} className="vd-postcard">
                <div className={`vd-postcard-photo ${back ? 'vd-flipped' : ''}`}>
                  <div
                    className="vd-postcard-inner"
                    style={{ transition: motion && pointerMotion ? undefined : 'none' }}
                  >
                    <div className="vd-postcard-front" inert={back}>
                      <Link href={directoryFor(p)} aria-label={name(p)}>
                        <img
                          src={assets + p.image}
                          srcSet={`${assets + p.image.replace('.webp', '-m.webp')} 640w, ${assets + p.image} 1600w`}
                          sizes="(max-width:700px) calc(100vw - 72px), 31vw"
                          alt={p.alt}
                          width="1600"
                          height="1200"
                          loading="lazy"
                        />
                      </Link>
                      <Coordinates place={p} enabled={motion && !back} label={name(p)} />
                    </div>
                    <div className="vd-postcard-back" inert={!back}>
                      <span>Vardenia</span>
                      <p>{body(p)}</p>
                      <Link href={directoryFor(p)}>{t('readRegion')} ↗</Link>
                    </div>
                  </div>
                </div>
                <button
                  className="vd-postcard-turn"
                  aria-expanded={back}
                  aria-label={`${back ? t('front') : t('turn')} · ${name(p)}`}
                  onClick={(event) => {
                    setPointerMotion(event.detail !== 0)
                    setFlipped((old) => (back ? old.filter((id) => id !== p.id) : [...old, p.id]))
                  }}
                >
                  {back ? t('front') : t('turn')} ↶
                </button>
                <h3>
                  <Link href={directoryFor(p)}>{name(p)}</Link>
                </h3>
                <p>{body(p)}</p>
              </article>
            )
          })}
        </div>
      </section>
      {directory}
      {connection}
      <section className="vd-magazine" id="magazine">
        <div className="vd-magazine-copy">
          <h2 data-vd-reveal>
            {t('magazineA')}
            <br />
            {t('magazineB')}
          </h2>
          <p data-vd-reveal>{t('magazineBody')}</p>
          <Link className="vd-button vd-button-light" href="/magazine">
            {t('readMagazine')} ↗
          </Link>
        </div>
        {magazine}
      </section>
    </div>
  )
}
