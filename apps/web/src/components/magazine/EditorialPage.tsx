import type { MagazineLabels } from './magazine-labels'

/** A page without listings: calm and neutral, showing its note or its number. */
export function EditorialPage({
  page,
  note,
  labels,
}: {
  page: number
  note: string | null
  labels: MagazineLabels
}) {
  return (
    <div
      data-editorial
      className="bg-surface-raised text-ink-500 flex h-full w-full items-center justify-center p-[10cqw] text-center"
    >
      <p
        className="font-display"
        style={{ fontSize: 'calc(var(--u) * 4)', overflowWrap: 'anywhere' }}
      >
        {note ?? labels.page(page)}
      </p>
    </div>
  )
}
