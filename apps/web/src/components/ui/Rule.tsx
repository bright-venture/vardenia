import { colors } from '@vardenia/tokens'

/**
 * The gold hairline.
 *
 * A one-pixel rule that fades out, used under a masthead heading and between
 * major blocks. It is the only decorative element in the kit, and it is here
 * rather than copied inline so that "the brand's rule" is one definition and
 * not eleven slightly different gradients.
 *
 * The gradient reads its colour from the token package rather than carrying a
 * hex, so a rebrand still only touches packages/tokens. Tailwind cannot express
 * a fade to transparent from a themed colour without an arbitrary value that
 * would hardcode the same hex in a class name, which is why this one is inline.
 *
 * Presentational, so it is `aria-hidden`. A screen reader announcing a
 * horizontal separator between every section is noise, and the headings already
 * carry the structure.
 */
export function Rule({
  inverse = false,
  className = '',
}: {
  inverse?: boolean
  className?: string
}) {
  // On the cedar ground the mid gold disappears, so the lighter one carries it.
  const from = inverse ? colors.gold[300] : colors.gold[500]

  return (
    <span
      aria-hidden
      className={`block h-px w-full max-w-[180px] ${className}`}
      style={{ backgroundImage: `linear-gradient(90deg, ${from}, transparent)` }}
    />
  )
}
