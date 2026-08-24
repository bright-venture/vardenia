import type { ReactNode } from 'react'

/**
 * The shell every section on the site sits in.
 *
 * # Why a component and not a copied div
 *
 * Before this, each page invented its own vertical rhythm and its own heading
 * block. The home page opened at `py-24`, the directory at `py-16` and the
 * magazine at `py-12`, which is why scrolling between them felt like three
 * sites. One component means the rhythm is a decision made once, and a new page
 * inherits it rather than guessing.
 *
 * # The heading block is a triplet
 *
 * An eyebrow, a title and an optional note that sits to the side rather than
 * underneath. The note is where the sentence explaining the section goes, and
 * putting it beside the title rather than below keeps the title the largest
 * thing in the reader's eye. On a phone it stacks, because two columns at 375px
 * is two columns of four words.
 *
 * # Tone
 *
 * `paper` is the default white ground. `raised` is limestone, for a section
 * that should separate from its neighbours without a rule. `inverse` is the
 * cedar ground and inverts its own type, which is the only place on the site
 * that happens - so it is worth using rarely and deliberately.
 */

const TONES = {
  paper: 'bg-surface-base',
  raised: 'bg-surface-raised border-ink-100 border-y',
  inverse: 'bg-cedar-900 text-surface-base',
} as const

export type BandTone = keyof typeof TONES

interface Props {
  children: ReactNode
  tone?: BandTone
  eyebrow?: ReactNode
  title?: ReactNode
  note?: ReactNode
  /** A link or button that belongs with the heading, e.g. "See all". */
  action?: ReactNode
  /** Tightens the vertical padding, for a strip rather than a full section. */
  compact?: boolean
  id?: string
  className?: string
  /** Widens past the standard measure, for a grid that needs the room. */
  wide?: boolean
}

export function Band({
  children,
  tone = 'paper',
  eyebrow,
  title,
  note,
  action,
  compact = false,
  id,
  className = '',
  wide = false,
}: Props) {
  const hasHeading = Boolean(eyebrow || title || note || action)

  return (
    <section
      id={id}
      className={`${TONES[tone]} ${compact ? 'py-12 sm:py-16' : 'py-16 sm:py-24'} ${className}`}
    >
      <div className={`mx-auto px-6 ${wide ? 'max-w-7xl' : 'max-w-6xl'}`}>
        {hasHeading ? (
          <div className="mb-10 flex flex-col gap-6 sm:mb-12 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <div className="min-w-0">
              {eyebrow ? <Eyebrow inverse={tone === 'inverse'}>{eyebrow}</Eyebrow> : null}
              {title ? (
                <h2
                  className={`mt-3 text-3xl sm:text-4xl ${
                    tone === 'inverse' ? 'text-surface-base' : 'text-ink-900'
                  }`}
                >
                  {title}
                </h2>
              ) : null}
            </div>

            {note || action ? (
              <div className="flex shrink-0 flex-col items-start gap-4 lg:items-end">
                {note ? (
                  <p
                    className={`max-w-[46ch] text-sm leading-relaxed lg:text-end ${
                      tone === 'inverse' ? 'text-cedar-100/75' : 'text-ink-500'
                    }`}
                  >
                    {note}
                  </p>
                ) : null}
                {action}
              </div>
            ) : null}
          </div>
        ) : null}

        {children}
      </div>
    </section>
  )
}

/**
 * The small gold label above a heading.
 *
 * Mono, because it is a label rather than prose, and the letterspacing is what
 * makes eleven characters read as a category rather than as a short sentence.
 */
export function Eyebrow({
  children,
  inverse = false,
}: {
  children: ReactNode
  inverse?: boolean
}) {
  return (
    <p
      className={`font-mono text-[11px] uppercase tracking-[0.16em] ${
        inverse ? 'text-gold-300' : 'text-gold-700'
      }`}
    >
      {children}
    </p>
  )
}
