import { colors } from '@vardenia/tokens'

/**
 * The pre-launch splash. Reached by the middleware rewrite from every public URL
 * while the coming-soon gate is on; see lib/coming-soon and middleware.ts.
 *
 * It is deliberately splash only - a wordmark, a line, no way in and nothing to
 * fill in. The one flourish is the "coming soon" line cycling through the ten
 * languages the real site speaks, which says what the product is without a word
 * of marketing copy. Everything animates in pure CSS so the page is a single
 * server-rendered document with no client JavaScript, and every motion is stood
 * down under prefers-reduced-motion.
 */

/** "Coming soon", in the ten UI languages, with the face each script wants. */
const PHRASES: { lang: string; dir?: 'rtl'; text: string; font: string }[] = [
  { lang: 'en', text: 'Coming soon', font: 'var(--font-fraunces), Georgia, serif' },
  { lang: 'ar', dir: 'rtl', text: 'قريباً', font: 'var(--font-amiri), serif' },
  { lang: 'fr', text: 'Bientôt disponible', font: 'var(--font-fraunces), Georgia, serif' },
  { lang: 'es', text: 'Muy pronto', font: 'var(--font-fraunces), Georgia, serif' },
  { lang: 'pt', text: 'Em breve', font: 'var(--font-fraunces), Georgia, serif' },
  { lang: 'ru', text: 'Скоро открытие', font: 'var(--font-manrope), system-ui, sans-serif' },
  {
    lang: 'zh',
    text: '即将上线',
    font: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  { lang: 'hi', text: 'जल्द आ रहा है', font: '"Noto Sans Devanagari", "Nirmala UI", sans-serif' },
  { lang: 'bn', text: 'শীঘ্রই আসছে', font: '"Noto Sans Bengali", "Nirmala UI", sans-serif' },
  { lang: 'ur', dir: 'rtl', text: 'جلد آ رہا ہے', font: 'var(--font-amiri), serif' },
]

// One full pass shows every phrase once; each is on screen for STEP seconds.
const STEP = 1.9
const CYCLE = PHRASES.length * STEP

const css = `
  .cs-root {
    min-height: 100vh;
    min-height: 100dvh;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
    background: ${colors.surface.inverse};
    color: ${colors.surface.raised};
    text-align: center;
  }
  /* Two slow gold glows breathing behind the mark, so the ground is never flat. */
  .cs-glow {
    position: absolute;
    inset: -20%;
    background:
      radial-gradient(38% 38% at 30% 28%, ${colors.gold[500]}33, transparent 70%),
      radial-gradient(42% 42% at 72% 74%, ${colors.cedar[500]}55, transparent 70%);
    animation: cs-breathe 14s ease-in-out infinite;
    z-index: 0;
  }
  .cs-inner { position: relative; z-index: 1; max-width: 34rem; }
  .cs-eyebrow {
    margin: 0;
    font-family: var(--font-manrope), system-ui, sans-serif;
    font-size: clamp(10px, 2.4vw, 12px);
    letter-spacing: 0.42em;
    text-transform: uppercase;
    color: ${colors.gold[300]};
    padding-left: 0.42em;
  }
  .cs-mark {
    margin: 1.25rem 0 0;
    font-family: var(--font-fraunces), Georgia, serif;
    font-weight: 400;
    font-size: clamp(3rem, 13vw, 6rem);
    line-height: 1;
    letter-spacing: 0.01em;
    background: linear-gradient(
      100deg,
      ${colors.surface.raised} 20%,
      ${colors.gold[300]} 48%,
      ${colors.surface.raised} 76%
    );
    background-size: 220% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: cs-sheen 7s ease-in-out infinite;
  }
  .cs-rule {
    width: 3rem;
    height: 1px;
    margin: 1.75rem auto;
    border: 0;
    background: ${colors.gold[300]};
    opacity: 0.6;
  }
  /* The cycling line. The phrases are stacked; each fades up for its slot. */
  .cs-line {
    position: relative;
    height: 2.4em;
    font-size: clamp(1.05rem, 4.4vw, 1.5rem);
  }
  .cs-word {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.surface.raised};
    opacity: 0;
    animation: cs-rotate ${CYCLE}s infinite;
  }
  .cs-foot {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 1.75rem;
    z-index: 1;
    margin: 0;
    font-family: var(--font-plex-mono, ui-monospace), monospace;
    font-size: 11px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: ${colors.cedar[300]};
  }
  @keyframes cs-sheen {
    0%, 100% { background-position: 130% 0; }
    50% { background-position: -30% 0; }
  }
  @keyframes cs-breathe {
    0%, 100% { transform: scale(1); opacity: 0.85; }
    50% { transform: scale(1.12); opacity: 1; }
  }
  @keyframes cs-rotate {
    0% { opacity: 0; transform: translateY(6px); }
    1.5% { opacity: 1; transform: translateY(0); }
    8.5% { opacity: 1; transform: translateY(0); }
    10% { opacity: 0; transform: translateY(-6px); }
    100% { opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .cs-glow, .cs-mark { animation: none; }
    .cs-mark { color: ${colors.surface.raised}; }
    .cs-word { animation: none; opacity: 0; }
    .cs-word[data-first='true'] { opacity: 1; }
  }
`

export default function ComingSoon() {
  return (
    <main className="cs-root">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="cs-glow" aria-hidden="true" />

      <div className="cs-inner">
        <p className="cs-eyebrow">Lebanon, curated</p>

        <h1 className="cs-mark">Vardenia</h1>

        <hr className="cs-rule" />

        <div className="cs-line" aria-label="Coming soon">
          {PHRASES.map((phrase, index) => (
            <span
              key={phrase.lang}
              className="cs-word"
              lang={phrase.lang}
              dir={phrase.dir}
              data-first={index === 0 ? 'true' : undefined}
              style={{ fontFamily: phrase.font, animationDelay: `${index * STEP}s` }}
            >
              {phrase.text}
            </span>
          ))}
        </div>
      </div>

      <p className="cs-foot">Vardenia</p>
    </main>
  )
}
