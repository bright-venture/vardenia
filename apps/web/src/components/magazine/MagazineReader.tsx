'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import {
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Maximize2,
  Minimize2,
  RotateCcw,
  X,
  ZoomIn,
} from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { readerCopy } from './reader-copy'
import { useJourneyMotion } from '../journey/browser-state'
import { loadPdfJs, PDFJS_ASSET_BASE } from './load-pdfjs'
import { openByRanges, RANGE_CHUNK } from './pdf-range'
import { nextPage, spreadPages } from './reader-model'
import styles from './MagazineReader.module.css'
import { PaperCurl, type PaperSnapshot as Snapshot, type PaperTurn as Turn } from './PaperCurl'
import { dragProgress, shouldCommitTurn } from './reader-curl'
import { PageCache, type DrawnPage } from './page-cache'
import { BatchLoader, batchesFor, savingData } from './page-batches'

type Copy = ReturnType<typeof readerCopy>
interface Props {
  src: string
  originalSrc: string
  title: string
  locale: string
  /**
   * The homepage's own invitation (11 November 2026): it draws the closed
   * reader itself and calls `open` from its button. The page around it then
   * carries the heading, so the reader's own header is left out.
   */
  invitation?: (open: () => void) => ReactNode
}
interface PageGesture {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastTime: number
  direction: 1 | -1
  width: number
  grabY: number
  velocity: number
  progress: number
  dragging: boolean
  touch: boolean
  tapTurns: boolean
}

/** PDF.js and PDF bytes are loaded only after an explicit invitation to read. */
export function MagazineReader({ src, originalSrc, title, locale, invitation }: Props) {
  const copy = readerCopy(locale)
  const [motion] = useJourneyMotion()
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  return (
    <section
      id="digital-edition"
      className={styles.reader}
      data-reader-motion={motion ? 'on' : 'off'}
      aria-label={copy.heading}
    >
      {invitation ? null : (
        <header className={styles.heading}>
          <div>
            <p>
              VARDENIA <span aria-hidden="true">/</span> {copy.heading}
            </p>
            <h2 dir="auto">{title}</h2>
          </div>
          <a href={originalSrc} target="_blank" rel="noopener noreferrer">
            {copy.openPdf}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </header>
      )}
      {open ? (
        <LoadedReader
          key={`${src}:${attempt}`}
          src={src}
          originalSrc={originalSrc}
          title={title}
          copy={copy}
          motion={motion}
          retry={() => setAttempt(attempt + 1)}
        />
      ) : invitation ? (
        invitation(() => setOpen(true))
      ) : (
        <div className={styles.start}>
          <div className={styles.bookInvitation} aria-hidden="true">
            <BookOpen strokeWidth={1} size={52} />
          </div>
          <p>{copy.intro}</p>
          <button className={styles.startButton} type="button" onClick={() => setOpen(true)}>
            {copy.start}
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  )
}

function LoadedReader({
  src,
  originalSrc,
  title,
  copy,
  retry,
  motion,
}: {
  src: string
  originalSrc: string
  title: string
  copy: Copy
  retry: () => void
  motion: boolean
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState(false)
  const focusTarget = useRef<HTMLDivElement>(null)
  useEffect(() => {
    focusTarget.current?.focus()
  }, [])
  useEffect(() => {
    let disposed = false
    let task: ReturnType<(typeof import('pdfjs-dist'))['getDocument']> | undefined
    const ranges = new AbortController()
    void loadPdfJs()
      .then(async (pdfjs) => {
        if (disposed) return
        // Page by page: see pdf-range.ts for why PDF.js cannot be left to
        // find out on its own. Falls back to the plain URL if ranges fail.
        const range = pdfjs.PDFDataRangeTransport
          ? await openByRanges(pdfjs.PDFDataRangeTransport, src, ranges.signal).catch(() => null)
          : null
        if (disposed) return
        task = pdfjs.getDocument({
          ...(range ? { range } : { url: src }),
          isEvalSupported: false,
          disableAutoFetch: true,
          disableRange: false,
          disableStream: true,
          rangeChunkSize: RANGE_CHUNK,
          cMapUrl: `${PDFJS_ASSET_BASE}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${PDFJS_ASSET_BASE}/standard_fonts/`,
          wasmUrl: `${PDFJS_ASSET_BASE}/wasm/`,
          useWasm: false,
        })
        return task.promise.then((pdf) => {
          if (!disposed) setDocument(pdf)
        })
      })
      .catch(() => {
        if (!disposed) setError(true)
      })
    return () => {
      disposed = true
      ranges.abort()
      void task?.destroy()
    }
  }, [src])
  return (
    <div ref={focusTarget} tabIndex={-1} aria-label={copy.heading}>
      {error ? (
        <div className={styles.start}>
          <p role="alert">{copy.error}</p>
          <button className={styles.startButton} type="button" onClick={retry}>
            <RotateCcw size={16} aria-hidden="true" />
            {copy.retry}
          </button>
        </div>
      ) : document ? (
        <ReaderBook
          document={document}
          originalSrc={originalSrc}
          title={title}
          copy={copy}
          motion={motion}
        />
      ) : (
        <div className={styles.loading} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <p>{copy.loading}</p>
        </div>
      )}
    </div>
  )
}

/** Copies only the visible raster, with a separate small memory budget for animation. */
function snapshots(element: HTMLElement | null): Snapshot[] {
  if (!element) return []
  return Array.from(
    element.querySelectorAll<HTMLCanvasElement>('canvas[data-reader-page]'),
  ).flatMap((source) => {
    if (source.dataset.ready !== 'true') return []
    const canvas = window.document.createElement('canvas')
    const ratio = Math.min(1, Math.sqrt(2_000_000 / (source.width * source.height)))
    canvas.width = Math.max(1, Math.floor(source.width * ratio))
    canvas.height = Math.max(1, Math.floor(source.height * ratio))
    const context = canvas.getContext('2d')
    if (!context) return []
    context.drawImage(source, 0, 0, canvas.width, canvas.height)
    return [
      { canvas, width: parseFloat(source.style.width), height: parseFloat(source.style.height) },
    ]
  })
}

function ReaderBook({
  document,
  originalSrc,
  title,
  copy,
  motion,
}: {
  document: PDFDocumentProxy
  originalSrc: string
  title: string
  copy: Copy
  motion: boolean
}) {
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState('1')
  const [zoom, setZoom] = useState(1)
  const [size, setSize] = useState({ width: 600, height: 480 })
  const [aspect, setAspect] = useState(0.75)
  const [spread, setSpread] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [textOpen, setTextOpen] = useState(false)
  const [texts, setTexts] = useState<Record<number, string>>({})
  const [turn, setTurn] = useState<Turn | null>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const book = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const expandButton = useRef<HTMLButtonElement>(null)
  const wasExpanded = useRef(false)
  const turnRef = useRef<Turn | null>(null)
  const waiting = useRef<Set<number> | null>(null)
  const turnId = useRef(0)
  // Every drawn page goes through here: kept, shared, and drawn ahead.
  const cache = useMemo(() => new PageCache(pdfDrawer(document)), [document])
  const gesture = useRef<PageGesture | null>(null)
  const returned = useRef(false)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const spreads = spread && size.width >= 640
  const pages = spreadPages(page, document.numPages, spreads)
  const firstPage = pages[0]!
  const lastPage = pages[pages.length - 1]!
  const pageWidth = Math.min(size.width / (spreads ? 2 : 1), size.height * aspect) * zoom
  const pageHeight = pageWidth / aspect
  const activeTurn = motion ? turn : null
  const shownPages = activeTurn && activeTurn.phase !== 'turning' ? activeTurn.fromPages : pages
  const shownFirst = shownPages[0]!
  const shownLast = shownPages[shownPages.length - 1]!
  // Opening the lone cover into a spread (or closing a spread onto a lone
  // page), the turning sheet slides half a page as the book recentres. The
  // book below slides with it, so the page under the sheet stays under it, and
  // the page that is the sheet's other side stays hidden until the sheet lands
  // on it; otherwise page 2 shows beside the cover the moment the turn starts.
  const bookShift =
    activeTurn &&
    activeTurn.phase !== 'returning' &&
    activeTurn.fromPages.length !== activeTurn.toPages.length
      ? {
          hide: activeTurn.direction > 0 ? ('first' as const) : ('last' as const),
          style: {
            transform: `translateX(calc(${-activeTurn.direction} * var(--paper-width) * (1 - var(--paper-progress, 0)) / 2))`,
          } as CSSProperties,
        }
      : null
  const pageStatus = `${copy.page} ${shownPages.join('–')} / ${document.numPages}`
  // While the reader rests on a spread, draw the spreads either side of it,
  // the next one first: a turn then finds its pages already in the cache.
  // Not while zoomed, where pages are drawn far larger than a turn needs.
  useEffect(() => {
    if (activeTurn || zoom !== 1) return
    const total = document.numPages
    const ahead = [
      ...spreadPages(nextPage(firstPage, total, spreads, 1), total, spreads),
      ...spreadPages(nextPage(firstPage, total, spreads, -1), total, spreads),
    ].filter((number) => number < firstPage || number > lastPage)
    const timer = window.setTimeout(() => void cache.prepare(ahead, pageWidth, pageHeight), 120)
    return () => window.clearTimeout(timer)
  }, [
    activeTurn,
    zoom,
    cache,
    document.numPages,
    firstPage,
    lastPage,
    spreads,
    pageWidth,
    pageHeight,
  ])
  // Ten pages at a time, downloaded ahead of the reader (page-batches.ts).
  // None for a reader whose phone asks to save data.
  // Made in an effect, not a memo, so the loader a cleanup stops is never the
  // one used again (React runs effects twice in development).
  const batches = useRef<BatchLoader | null>(null)
  useEffect(() => {
    if (savingData()) return
    const loader = new BatchLoader(pdfFetcher(document), document.numPages)
    batches.current = loader
    return () => {
      loader.stop()
      if (batches.current === loader) batches.current = null
    }
  }, [document])
  useEffect(() => {
    // A moment's wait, so the open page's own download goes first.
    const timer = window.setTimeout(
      () => batches.current?.want(batchesFor(firstPage, lastPage, document.numPages)),
      400,
    )
    return () => window.clearTimeout(timer)
  }, [document, firstPage, lastPage])
  const cancelTurn = useCallback(() => {
    if (turnRef.current)
      setDraft(
        String(
          (turnRef.current.phase === 'returning'
            ? turnRef.current.fromPages
            : turnRef.current.toPages)[0],
        ),
      )
    waiting.current = null
    gesture.current = null
    turnRef.current = null
    setTurn(null)
  }, [])

  useEffect(() => {
    // The shared preference includes both the site switch and the OS setting.
    // Hide the animation immediately in render, then discard any pending raster work.
    if (motion) return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) cancelTurn()
    })
    return () => {
      cancelled = true
    }
  }, [motion, cancelTurn])
  useEffect(() => {
    if (window.document.activeElement?.closest('#digital-edition')) viewport.current?.focus()
    let cancelled = false
    void document
      .getPage(1)
      .then((first) => {
        if (cancelled) return
        const natural = first.getViewport({ scale: 1 })
        cancelTurn()
        setAspect(natural.width / natural.height)
        // A landscape PDF page commonly already contains the printed spread.
        setSpread(natural.width <= natural.height)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [document, cancelTurn])
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      cancelTurn()
      setSize({
        width: Math.max(120, entry.contentRect.width),
        height: Math.max(120, entry.contentRect.height || window.innerHeight * 0.72 - 70),
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [expanded, cancelTurn])
  useLayoutEffect(() => {
    if (!expanded) {
      if (wasExpanded.current) expandButton.current?.focus()
      wasExpanded.current = false
      return
    }
    wasExpanded.current = true
    const element = dialog.current
    const originalOverflow = window.document.body.style.overflow
    window.document.body.style.overflow = 'hidden'
    element?.showModal()
    viewport.current?.focus()
    return () => {
      element?.close()
      window.document.body.style.overflow = originalOverflow
    }
  }, [expanded])
  const finishPaper = useCallback(
    (isReturn: boolean) => {
      if (isReturn) {
        returned.current = true
        if (!turnRef.current?.ready) return
      }
      cancelTurn()
    },
    [cancelTurn],
  )
  const onText = useCallback((number: number, value: string) => {
    setTexts((previous) => ({ ...previous, [number]: value }))
  }, [])
  const onSettled = useCallback(
    (number: number) => {
      if (!waiting.current || !turnRef.current) return
      waiting.current.delete(number)
      if (waiting.current.size) return
      waiting.current = null
      const current = turnRef.current
      if (current.phase === 'returning') {
        const next = { ...current, ready: true }
        turnRef.current = next
        if (returned.current) cancelTurn()
        else setTurn(next)
        return
      }
      const incoming = snapshots(book.current)
      const next: Turn = {
        ...current,
        ready: true,
        phase: current.phase === 'dragging' ? 'dragging' : 'turning',
        back: current.direction > 0 ? incoming[0] : incoming[incoming.length - 1],
      }
      if (gesture.current?.dragging) next.control.current?.paint?.(gesture.current.progress)
      turnRef.current = next
      if (next.phase === 'turning') setDraft(String(next.toPages[0]))
      setTurn(next)
    },
    [cancelTurn],
  )
  const changePage = (next: number, animate = true, drag?: PageGesture) => {
    if (animate && motion && turnRef.current) return
    const bounded = Math.max(1, Math.min(document.numPages, next))
    const nextPages = spreadPages(bounded, document.numPages, spreads)
    const value = nextPages[0]!
    if (value === firstPage) {
      setDraft(String(firstPage))
      return
    }
    const previous = motion && animate && zoom === 1 ? snapshots(book.current) : []
    if (previous.length === pages.length) {
      const transition: Turn = {
        id: ++turnId.current,
        direction: value > firstPage ? 1 : -1,
        pages: previous,
        phase: drag ? 'dragging' : 'waiting',
        ready: false,
        initialProgress: drag ? Math.min(0.1, drag.progress) : 0,
        grabY: drag?.grabY ?? 0.72,
        control: { current: { progress: drag ? Math.min(0.1, drag.progress) : 0 } },
        fromPages: pages,
        toPages: nextPages,
      }
      returned.current = false
      waiting.current = new Set(nextPages)
      turnRef.current = transition
      setTurn(transition)
    } else {
      cancelTurn()
      setDraft(String(value))
    }
    setPage(value)
    viewport.current?.scrollTo({ top: 0, left: 0 })
  }
  const changeExpanded = (value: boolean) => {
    cancelTurn()
    setExpanded(value)
  }
  const move = (delta: number) => changePage(nextPage(page, document.numPages, spreads, delta))
  const submitPage = () => {
    const value = Number(draft)
    if (Number.isInteger(value) && value > 0) changePage(value, false)
    else setDraft(String(firstPage))
  }
  const releaseGesture = (cancelled: boolean) => {
    const active = gesture.current
    gesture.current = null
    if (!active) return
    if (viewport.current?.hasPointerCapture?.(active.pointerId))
      viewport.current.releasePointerCapture(active.pointerId)
    const current = turnRef.current
    if (!active.dragging) {
      if (!cancelled && active.tapTurns) move(active.direction)
      return
    }
    if (!current) return
    const distance = (active.startX - active.lastX) * active.direction
    if (!cancelled && shouldCommitTurn(active.progress, active.velocity, distance)) {
      const next: Turn = { ...current, phase: current.ready ? 'turning' : 'waiting' }
      turnRef.current = next
      if (next.ready) setDraft(String(next.toPages[0]))
      setTurn(next)
    } else {
      const next: Turn = {
        ...current,
        phase: 'returning',
        ready: false,
      }
      returned.current = false
      waiting.current = new Set(current.fromPages)
      turnRef.current = next
      setPage(current.fromPages[0]!)
      setDraft(String(current.fromPages[0]))
      setTurn(next)
    }
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!motion || zoom !== 1 || turnRef.current || event.button !== 0 || event.isPrimary === false)
      return
    if (!(event.target as HTMLElement).closest('[data-reader-book]')) return
    const bounds = book.current?.getBoundingClientRect()
    if (!bounds || !bounds.width) return
    const fraction = (event.clientX - bounds.left) / bounds.width
    const direction: 1 | -1 = fraction >= 0.5 ? 1 : -1
    const isTouch = event.pointerType === 'touch'
    if (
      !isTouch &&
      ((direction < 0 && firstPage === 1) || (direction > 0 && lastPage === document.numPages))
    )
      return
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      direction,
      width: bounds.width / pages.length,
      grabY: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
      progress: 0,
      velocity: 0,
      dragging: false,
      touch: isTouch,
      tapTurns: fraction < 0.24 || fraction > 0.76,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    const dx = event.clientX - active.startX,
      dy = event.clientY - active.startY
    if (!active.dragging) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.25) {
        releaseGesture(true)
        return
      }
      if (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(dy) * 1.25) return
      if (active.touch) active.direction = dx < 0 ? 1 : -1
      if (
        (active.direction < 0 && firstPage === 1) ||
        (active.direction > 0 && lastPage === document.numPages)
      ) {
        releaseGesture(true)
        return
      }
      if (dx * active.direction >= 0) return
      active.dragging = true
      active.progress = dragProgress(active.startX, event.clientX, active.width, active.direction)
      changePage(nextPage(page, document.numPages, spreads, active.direction), true, active)
      if (!turnRef.current) {
        gesture.current = null
        return
      }
    }
    event.preventDefault()
    active.progress = dragProgress(active.startX, event.clientX, active.width, active.direction)
    active.velocity =
      ((active.lastX - event.clientX) * active.direction) /
      Math.max(1, event.timeStamp - active.lastTime)
    active.lastX = event.clientX
    active.lastTime = event.timeStamp
    const current = turnRef.current
    // Curl the edge immediately, but never expose a blank destination while it is loading.
    if (current)
      current.control.current?.paint?.(
        current.ready ? active.progress : Math.min(0.1, active.progress),
      )
  }
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      changeExpanded(false)
      return
    }
    if ((event.target as HTMLElement).closest('input, select, button, a, summary')) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      move(event.key === 'ArrowRight' ? 1 : -1)
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      changePage(event.key === 'Home' ? 1 : document.numPages, false)
    }
  }
  const content = (
    <>
      <div className={styles.stageHeader}>
        <div className={styles.stageTitle}>
          <BookOpen size={16} aria-hidden="true" />
          <span dir="auto">{title}</span>
        </div>
        <div className={styles.stageMeta}>
          {activeTurn && !activeTurn.ready && (
            <span className={styles.turnLoading} title={copy.loading} aria-hidden="true">
              <span className={styles.spinner} />
            </span>
          )}
          <span>
            {String(shownFirst).padStart(2, '0')} <span className={styles.metaDivider}>/</span>{' '}
            {String(document.numPages).padStart(2, '0')}
          </span>
          {expanded && (
            <a
              className={styles.iconButton}
              href={originalSrc}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={copy.openPdf}
              title={copy.openPdf}
            >
              <ArrowUpRight size={19} aria-hidden="true" />
            </a>
          )}
          {expanded && (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={copy.collapse}
              title={copy.collapse}
              onClick={() => changeExpanded(false)}
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className={styles.stage}>
        <button
          className={`${styles.edgeButton} ${styles.previousEdge}`}
          type="button"
          aria-label={copy.previous}
          title={copy.previous}
          onClick={() => move(-1)}
          disabled={firstPage === 1 || !!activeTurn}
        >
          <ChevronLeft size={26} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <div
          ref={viewport}
          className={`${styles.viewport} ${motion && zoom === 1 ? styles.dragViewport : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => releaseGesture(false)}
          onPointerCancel={() => releaseGesture(true)}
          onLostPointerCapture={() => {
            if (gesture.current) releaseGesture(true)
          }}
          tabIndex={0}
          aria-label={`${title}: ${pageStatus}`}
          aria-describedby="magazine-reader-hint"
          onTouchStart={(event) => {
            if (motion && typeof window.PointerEvent !== 'undefined') return
            const point = event.touches[0]
            touch.current =
              event.touches.length === 1 && point ? { x: point.clientX, y: point.clientY } : null
          }}
          onTouchMove={(event) => {
            if (event.touches.length !== 1) touch.current = null
          }}
          onTouchEnd={(event) => {
            const start = touch.current
            touch.current = null
            const end = event.changedTouches[0]
            if (!start || !end || zoom !== 1) return
            const dx = end.clientX - start.x
            const dy = end.clientY - start.y
            if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) move(dx < 0 ? 1 : -1)
          }}
        >
          <div
            className={styles.bookFrame}
            style={
              {
                '--paper-width': `${pageWidth}px`,
                '--paper-height': `${pageHeight}px`,
              } as CSSProperties
            }
          >
            <div
              ref={book}
              className={`${styles.book} ${pages.length === 2 ? styles.spreadBook : ''}`}
              data-reader-book="true"
              data-turn-hide={bookShift?.hide}
              aria-busy={!!activeTurn && !activeTurn.ready}
              style={bookShift?.style}
            >
              {pages.map((number) => (
                <ReaderPage
                  key={number}
                  document={document}
                  cache={cache}
                  page={number}
                  width={pageWidth}
                  height={pageHeight}
                  copy={copy}
                  onText={onText}
                  onSettled={onSettled}
                />
              ))}
            </div>
            {activeTurn && (
              <PaperCurl key={activeTurn.id} turn={activeTurn} onFinish={finishPaper} />
            )}
          </div>
        </div>
        <button
          className={`${styles.edgeButton} ${styles.nextEdge}`}
          type="button"
          aria-label={copy.next}
          title={copy.next}
          onClick={() => move(1)}
          disabled={lastPage === document.numPages || !!activeTurn}
        >
          <ChevronRight size={26} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <div className={styles.stageFooter} aria-hidden="true">
          <span>VARDENIA</span>
          <span>{Math.round((shownLast / document.numPages) * 100)}%</span>
        </div>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.toolsLeft}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={copy.pageText}
            title={copy.pageText}
            aria-expanded={textOpen}
            aria-controls="magazine-reader-text"
            onClick={() => setTextOpen(!textOpen)}
          >
            <FileText size={19} aria-hidden="true" />
          </button>
          {size.width >= 640 && (
            <label className={styles.layout}>
              <BookOpen size={18} aria-hidden="true" />
              <span className={styles.srOnly}>{copy.layout}</span>
              <select
                value={spread ? 'spread' : 'single'}
                onChange={(event) => {
                  cancelTurn()
                  setSpread(event.target.value === 'spread')
                }}
              >
                <option value="spread">{copy.spread}</option>
                <option value="single">{copy.single}</option>
              </select>
            </label>
          )}
        </div>
        <div className={styles.pageControls} dir="ltr">
          <button
            type="button"
            className={styles.iconButton}
            aria-label={copy.previous}
            title={copy.previous}
            onClick={() => move(-1)}
            disabled={firstPage === 1 || !!activeTurn}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              submitPage()
            }}
          >
            <label>
              <span className={styles.srOnly}>{copy.goTo}</span>
              <input
                aria-label={copy.goTo}
                inputMode="numeric"
                type="number"
                min="1"
                max={document.numPages}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={submitPage}
              />
            </label>
            <span className={styles.pageTotal}>/ {document.numPages}</span>
          </form>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={copy.next}
            title={copy.next}
            onClick={() => move(1)}
            disabled={lastPage === document.numPages || !!activeTurn}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.toolsRight}>
          <label className={styles.zoomControl}>
            <ZoomIn size={18} aria-hidden="true" />
            <span className={styles.srOnly}>{copy.zoom}</span>
            <select
              aria-label={copy.zoom}
              value={zoom}
              onChange={(event) => {
                cancelTurn()
                setZoom(Number(event.target.value))
              }}
            >
              <option value={1}>{copy.fit}</option>
              <option value={1.25}>125%</option>
              <option value={1.5}>150%</option>
              <option value={2}>200%</option>
              <option value={3}>300%</option>
              <option value={4}>400%</option>
            </select>
          </label>
          <button
            ref={expandButton}
            type="button"
            className={styles.iconButton}
            aria-label={expanded ? copy.collapse : copy.expand}
            title={expanded ? copy.collapse : copy.expand}
            aria-pressed={expanded}
            onClick={() => changeExpanded(!expanded)}
          >
            {expanded ? (
              <Minimize2 size={19} aria-hidden="true" />
            ) : (
              <Maximize2 size={19} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      <div className={styles.readingProgress} aria-hidden="true">
        <span style={{ width: `${(shownLast / document.numPages) * 100}%` }} />
      </div>
      <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        {pageStatus}
        {activeTurn && !activeTurn.ready ? `. ${copy.loading}` : ''}
      </p>
      <p id="magazine-reader-hint" className={styles.hint}>
        {copy.hint}
      </p>
      {textOpen && (
        <section id="magazine-reader-text" className={styles.textPanel} aria-label={copy.pageText}>
          <header>
            <h3>{copy.pageText}</h3>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={copy.pageText}
              aria-expanded="true"
              onClick={() => setTextOpen(false)}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          {shownPages.map((number) => (
            <article key={number}>
              <h4>
                {copy.page} {number}
              </h4>
              <p dir="auto">{texts[number] ?? copy.loading}</p>
            </article>
          ))}
          <a href={originalSrc} target="_blank" rel="noopener noreferrer">
            {copy.openPdf}
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </section>
      )}
    </>
  )
  return expanded ? (
    <dialog
      ref={dialog}
      className={styles.expanded}
      data-reader-motion={motion ? 'on' : 'off'}
      aria-label={`${copy.heading}: ${title}`}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault()
        changeExpanded(false)
      }}
    >
      {content}
    </dialog>
  ) : (
    <div className={styles.shell} onKeyDown={onKeyDown}>
      {content}
    </div>
  )
}

/**
 * Downloads one page for a batch (page-batches.ts) without drawing it. Reading
 * its operator list makes PDF.js fetch the page's content and photographs;
 * `cleanup` then lets go of the decoded photographs, which a phone cannot keep
 * ten pages of, while the downloaded bytes stay with the document. PDF.js
 * defers the cleanup if the page cache is drawing the same page.
 */
function pdfFetcher(document: PDFDocumentProxy) {
  return async (page: number): Promise<void> => {
    const pdfPage = await document.getPage(page)
    await pdfPage.getOperatorList()
    pdfPage.cleanup()
  }
}

/**
 * Draws one PDF page offscreen at the size it is shown, sharp on a high
 * density screen but bounded, so a full-bleed photograph cannot blow the
 * memory of a phone. Used through the page cache (page-cache.ts).
 */
function pdfDrawer(document: PDFDocumentProxy) {
  return async (page: number, width: number, height: number): Promise<DrawnPage> => {
    const pdfPage = await document.getPage(page)
    const target = window.document.createElement('canvas')
    const natural = pdfPage.getViewport({ scale: 1 })
    const view = pdfPage.getViewport({
      scale: Math.min(width / natural.width, height / natural.height),
    })
    // The screen's own density, up to 3: most phones are 3x, and drawing them
    // at 2x (the old cap) left small type soft. The pixel budget, not the
    // ratio, is what keeps a page within a phone's memory.
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      3,
      Math.sqrt(8_000_000 / (view.width * view.height)),
    )
    target.width = Math.max(1, Math.floor(view.width * ratio))
    target.height = Math.max(1, Math.floor(view.height * ratio))
    await pdfPage.render({
      canvas: target,
      viewport: view,
      transform: [ratio, 0, 0, ratio, 0, 0],
    }).promise
    return { canvas: target, width: view.width, height: view.height }
  }
}

function ReaderPage({
  document,
  cache,
  page,
  width,
  height,
  copy,
  onText,
  onSettled,
}: {
  document: PDFDocumentProxy
  cache: PageCache
  page: number
  width: number
  height: number
  copy: Copy
  onText: (page: number, text: string) => void
  onSettled: (page: number) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  // Layout effect: a page the cache already holds is on screen in the same
  // frame, so a turn to a prepared spread never shows its loading state.
  useLayoutEffect(() => {
    let cancelled = false
    const show = (drawn: DrawnPage) => {
      const visible = canvas.current
      if (cancelled || !visible) return
      // Replace the visible raster atomically. Resize/zoom never clears it.
      visible.width = drawn.canvas.width
      visible.height = drawn.canvas.height
      visible.style.width = `${drawn.width}px`
      visible.style.height = `${drawn.height}px`
      visible.getContext('2d')?.drawImage(drawn.canvas, 0, 0)
      visible.dataset.ready = 'true'
      setStatus('ready')
      // After the current commit, not inside it: a kept page is ready in the
      // same frame it mounts, before the turn's overlay can take a paint.
      queueMicrotask(() => {
        if (!cancelled) onSettled(page)
      })
      void document
        .getPage(page)
        .then((pdfPage) => pdfPage.getTextContent())
        .catch(() => ({ items: [] }))
        .then((content) => {
          if (!cancelled)
            onText(
              page,
              content.items
                .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
                .join(' ') || copy.noText,
            )
        })
    }
    const kept = cache.peek(page, width, height)
    if (kept) show(kept)
    else
      cache.get(page, width, height).then(show, (error: unknown) => {
        if (
          !cancelled &&
          !(error instanceof Error && error.name === 'RenderingCancelledException')
        ) {
          setStatus('error')
          onText(page, copy.noText)
          onSettled(page)
        }
      })
    // A drawing in progress is shared with the cache, so it is left to finish
    // there rather than cancelled: the page is usually a neighbour, wanted soon.
    return () => {
      cancelled = true
    }
  }, [cache, document, page, width, height, attempt, copy.noText, onSettled, onText])
  return (
    <div className={styles.page} style={{ width, height }} aria-busy={status === 'loading'}>
      {status !== 'ready' && (
        <div role="status" className={styles.pageStatus}>
          {status === 'loading' && <span className={styles.spinner} aria-hidden="true" />}
          <p>{status === 'error' ? copy.error : copy.loading}</p>
          {status === 'error' && (
            <button
              type="button"
              onClick={() => {
                setStatus('loading')
                setAttempt(attempt + 1)
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              {copy.retry}
            </button>
          )}
        </div>
      )}
      <canvas
        ref={canvas}
        data-reader-page={page}
        aria-hidden="true"
        style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }}
      />
    </div>
  )
}
