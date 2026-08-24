import type { Config } from 'tailwindcss'
import { breakpoints, colors, radius, spacing } from '@vardenia/tokens'

/**
 * Tailwind is configured FROM the token package rather than duplicating hex
 * values. Rebranding means editing packages/tokens and nothing else.
 */
export default {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    // Payload's admin UI is styled separately and deliberately excluded.
  ],
  theme: {
    screens: Object.fromEntries(
      Object.entries(breakpoints).map(([key, value]) => [key, `${value}px`]),
    ),
    extend: {
      colors,
      borderRadius: Object.fromEntries(
        Object.entries(radius).map(([key, value]) => [
          key,
          typeof value === 'number' ? `${value}px` : value,
        ]),
      ),
      spacing: Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [key, `${value}px`]),
      ),
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
} satisfies Config
