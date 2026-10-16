/** Shared display grade: cool blacks, warm highlights and restrained colour. */
export function CinematicGrade() {
  return (
    <svg className="vd-colour-grade" width="0" height="0" aria-hidden focusable="false">
      <defs>
        <filter id="vd-cinematic-grade" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0.78" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0.012 0.175 0.47 0.785 0.98" />
            <feFuncG type="table" tableValues="0.021 0.177 0.465 0.755 0.955" />
            <feFuncB type="table" tableValues="0.038 0.19 0.455 0.71 0.91" />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  )
}
