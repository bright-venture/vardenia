/**
 * One word or phrase of a heading, marked for the Arabic flourish.
 *
 * Wraps the first occurrence of `accent` in `.em-ar`, which is styled only
 * under `html[lang="ar"]` (gold, heavier): the emphasis other scripts get from
 * italics. The accents passed in are Arabic, so in every other language the
 * phrase is not found and the text renders untouched.
 */
export function Accent({
  text,
  accent,
  dark = false,
}: {
  text: string
  accent: string
  /** On a navy ground, where the lighter gold reads. */
  dark?: boolean
}) {
  const at = accent ? text.indexOf(accent) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <span className={dark ? 'em-ar on-dark' : 'em-ar'}>{accent}</span>
      {text.slice(at + accent.length)}
    </>
  )
}
