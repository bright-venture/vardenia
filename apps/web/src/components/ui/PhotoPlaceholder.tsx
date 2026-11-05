/** Neutral reserved space, never a substitute photograph or content claim. */
export function PhotoPlaceholder() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-ink-300 group-hover:text-gold-500 absolute inset-0 m-auto size-7 transition-colors duration-500"
      data-photo-placeholder
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-4.6-4.6a2 2 0 0 0-2.8 0L3 21" />
    </svg>
  )
}
