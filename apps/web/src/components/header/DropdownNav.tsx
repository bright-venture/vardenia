import type { ReactNode } from 'react'

/**
 * A navigation dropdown that needs no JavaScript.
 *
 * Opens on hover and on keyboard focus, through `group-hover` and
 * `group-focus-within`. That second one is what makes it usable without a mouse:
 * tabbing into the trigger opens the panel, tabbing through the links keeps it
 * open, and tabbing past the last one closes it. No state, no effect, no script.
 *
 * # Why not Radix
 *
 * The reference this is modelled on uses Radix's navigation menu, which is
 * excellent and would bring shadcn's conventions with it - `bg-background`,
 * `text-muted-foreground`, a second set of design tokens beside the one in
 * packages/tokens whose entire purpose is that rebranding means editing one
 * file. Two token systems in one header is a worse problem than the one Radix
 * would solve here.
 *
 * What Radix genuinely buys is arrow-key roving focus and an escape handler.
 * Worth revisiting if these menus grow; for two of them, tab and shift-tab are
 * the interaction people actually use.
 *
 * # The gap that is not a gap
 *
 * `pt-3` on the panel rather than a margin, so the padding bridges the space
 * between trigger and panel. With a margin the pointer crosses dead ground on
 * the way down and the menu closes underneath it.
 */
export function DropdownNav({
  label,
  children,
  align = 'start',
}: {
  label: string
  children: ReactNode
  align?: 'start' | 'end'
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        // Not a link: it goes nowhere, and announcing it as one promises a
        // destination that does not exist.
        className="text-ink-700 hover:text-ink-900 group-focus-within:text-ink-900 flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors"
        aria-haspopup="true"
      >
        {label}
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="h-3 w-3 transition-transform duration-200 group-focus-within:rotate-180 group-hover:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>

      <div
        className={[
          'invisible absolute top-full z-50 pt-3 opacity-0',
          'transition-[opacity,transform] duration-200',
          'translate-y-1 group-focus-within:translate-y-0 group-hover:translate-y-0',
          'group-hover:visible group-hover:opacity-100',
          'group-focus-within:visible group-focus-within:opacity-100',
          align === 'end' ? 'end-0' : 'start-0',
        ].join(' ')}
      >
        <div className="border-ink-100 bg-surface-base shadow-ink-900/5 rounded-lg border p-2 shadow-xl">
          {children}
        </div>
      </div>
    </div>
  )
}
