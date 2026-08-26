'use client'

import { useEffect, useRef, useState } from 'react'
import { Warp } from '@paper-design/shaders-react'
import { SECTIONS } from '@vardenia/core'
import { colors } from '@vardenia/tokens'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../../i18n/routing'
import { SECTION_ICONS } from '../navIcons'

/**
 * The seven sections, over a generated background.
 *
 * # Why a shader and not a photograph
 *
 * There is no photography yet, and there will not be for a while. A shader is
 * generated rather than shot, so this is the one kind of image the site can
 * have today that is not a placeholder pretending to be content. It says
 * nothing untrue about Lebanon because it does not depict Lebanon.
 *
 * When photography arrives this can stay: it sits behind the cards, not in
 * them, so a hero image on a card does not fight it.
 *
 * # The palette is the brand, not the library's
 *
 * The component this is adapted from shipped six neon gradients - magenta,
 * cyan, acid green. On the cedar and gold ground that reads as a different
 * website embedded in this one. Every colour here comes from the token package,
 * so a rebrand still touches one file. Each section gets its own weighting of
 * the same four colours rather than its own palette, which is what keeps seven
 * cards looking like one set.
 *
 * # Only what you can see is running
 *
 * Each card is its own WebGL context. Seven of them animating permanently is a
 * real cost on a phone - browsers cap simultaneous contexts, and a mid-range
 * Android spends the battery whether or not the card is on screen. An
 * IntersectionObserver mounts the shader when a card scrolls into view and
 * unmounts it when it leaves, so the count is bounded by what fits on the
 * screen rather than by how many sections exist.
 *
 * # Reduced motion
 *
 * The library has no handling for it - it animates regardless. So the
 * preference is read here, and a reader who has asked for less movement gets
 * the flat cedar card with no canvas mounted at all. Not a slower animation: no
 * animation, and no GPU work either.
 */

/**
 * Per-section shader settings, all drawn from the same four brand colours.
 *
 * # Two corrections to the component this came from
 *
 * It asked for `shape: "dots"`, which this library does not have. The patterns
 * are `checks`, `stripes` and `edge`; an unknown name falls through to the
 * default, so the setting looked deliberate and did nothing.
 *
 * And `colors` has to be a mutable `string[]`. The token package exports its
 * palette `as const`, so it is passed through a spread rather than handed over
 * directly - otherwise the readonly tuple does not satisfy the prop.
 */
function shaderFor(index: number) {
  const palette: string[] = [
    colors.cedar[900],
    colors.cedar[700],
    colors.gold[700],
    colors.gold[300],
  ]

  // Varied, not random: the same section always looks the same, so the page
  // does not reshuffle itself between visits.
  const variants = [
    {
      proportion: 0.32,
      softness: 0.9,
      distortion: 0.14,
      swirl: 0.6,
      swirlIterations: 8,
      shape: 'checks' as const,
      shapeScale: 0.09,
    },
    {
      proportion: 0.4,
      softness: 1.15,
      distortion: 0.2,
      swirl: 0.85,
      swirlIterations: 11,
      shape: 'stripes' as const,
      shapeScale: 0.12,
    },
    {
      proportion: 0.36,
      softness: 0.95,
      distortion: 0.17,
      swirl: 0.7,
      swirlIterations: 10,
      shape: 'checks' as const,
      shapeScale: 0.1,
    },
    {
      proportion: 0.44,
      softness: 1.05,
      distortion: 0.21,
      swirl: 0.78,
      swirlIterations: 13,
      shape: 'edge' as const,
      shapeScale: 0.11,
    },
    {
      proportion: 0.34,
      softness: 0.88,
      distortion: 0.15,
      swirl: 0.66,
      swirlIterations: 9,
      shape: 'checks' as const,
      shapeScale: 0.08,
    },
    {
      proportion: 0.42,
      softness: 1.1,
      distortion: 0.19,
      swirl: 0.82,
      swirlIterations: 12,
      shape: 'stripes' as const,
      shapeScale: 0.13,
    },
    {
      proportion: 0.38,
      softness: 1.0,
      distortion: 0.16,
      swirl: 0.72,
      swirlIterations: 10,
      shape: 'edge' as const,
      shapeScale: 0.1,
    },
  ]

  return { ...variants[index % variants.length], colors: palette }
}

/** True once the reader has NOT asked for reduced motion. */
function useMotionAllowed() {
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setAllowed(!query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  return allowed
}

/** True while the element is on screen, so an off-screen shader can unmount. */
function useOnScreen<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      // A little margin, so the shader is running by the time it is looked at.
      { rootMargin: '200px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])

  return visible
}

function SectionCard({
  index,
  path,
  title,
  description,
  Icon,
  motionAllowed,
}: {
  index: number
  path: string
  title: string
  description: string
  Icon: (typeof SECTION_ICONS)[keyof typeof SECTION_ICONS]
  motionAllowed: boolean
}) {
  const ref = useRef<HTMLAnchorElement>(null)
  const onScreen = useOnScreen(ref)
  const config = shaderFor(index)

  return (
    <Link
      ref={ref}
      href={`/${path}`}
      className="group relative block h-72 overflow-hidden rounded-lg"
    >
      {/* The cedar ground is painted first and always. The canvas is an
          enhancement on top of it, so a card is never blank while WebGL starts
          up, and never blank at all if it fails or is refused. */}
      <div className="bg-cedar-900 absolute inset-0" />

      {motionAllowed && onScreen ? (
        <div className="absolute inset-0" aria-hidden>
          <Warp
            style={{ height: '100%', width: '100%' }}
            {...config}
            scale={1}
            rotation={0}
            speed={0.5}
          />
        </div>
      ) : null}

      {/* A scrim, so the type is legible whatever the shader is doing beneath
          it. Without this the contrast changes as the animation moves, which is
          the difference between a readable card and a decorative one. */}
      <div className="from-cedar-900/95 via-cedar-900/70 absolute inset-0 bg-gradient-to-t to-transparent" />

      <div className="relative z-10 flex h-full flex-col p-6">
        <Icon aria-hidden className="text-gold-300 size-6 shrink-0" strokeWidth={1.5} />

        <h3 className="font-display text-surface-base mt-auto text-2xl leading-tight">{title}</h3>
        <p className="text-cedar-100/75 mt-2 text-sm leading-relaxed">{description}</p>

        <span className="text-gold-300 mt-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em]">
          {/* Decorative arrow: the card is already a link and its heading names
              the destination, so announcing "chevron" adds nothing. */}
          <span className="transition-transform duration-300 group-hover:translate-x-1">
            &rarr;
          </span>
        </span>
      </div>
    </Link>
  )
}

export function SectionShaderCards({ locale }: { locale: Locale }) {
  const ar = locale === 'ar'
  const motionAllowed = useMotionAllowed()

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {SECTIONS.map((section, index) => (
        <SectionCard
          key={section.path}
          index={index}
          path={section.path}
          title={ar ? section.ar : section.en}
          description={ar ? section.descriptionAr : section.descriptionEn}
          Icon={SECTION_ICONS[section.category]}
          motionAllowed={motionAllowed}
        />
      ))}
    </div>
  )
}

export default SectionShaderCards
