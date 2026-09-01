import { getTranslations } from 'next-intl/server'

/**
 * The band of place names that slides across the homepage.
 *
 * # It is decoration, and it is marked as such
 *
 * `aria-hidden`, no links, no headings. A screen reader hearing ten town names
 * read out between two sections learns nothing; a sighted reader gets a moment
 * of Lebanon between the magazine and the sign-up box. Everything it names is
 * reachable from the directory by other means.
 *
 * # The names are places we actually have listings in
 *
 * The commissioned design draws ten towns spread across the country - Beirut,
 * Batroun, Tyre, Ehden, Baalbek. Seven of them have nothing behind them: the
 * catalogue is 308 listings in two districts, Keserwan and Jbeil. A homepage
 * that sets Baalbek in 72px type is making a claim about coverage, and the
 * reader who follows it finds an empty search.
 *
 * So the list is the same shape and different words: ten towns, each drawn from
 * the addresses on the listings themselves. Byblos has 74, Jounieh 59, Nahr
 * Ibrahim 13 - the quietest name here still has more behind it than seven of the
 * design's had. It reads as an itinerary rather than a map of Lebanon, which is
 * what this business currently is.
 *
 * When coverage widens the list is a line in the message catalogue, not a change
 * here.
 *
 * # Why the list is in the catalogue at all
 *
 * Because the Arabic is not a transliteration job - جبيل is what Byblos is
 * called, not "Byblos" spelled in Arabic letters - so the two lists are genuinely
 * different content and belong where the rest of the content is. It is the first
 * array in the message files, which is why it is read with `t.raw`: the
 * formatter is for strings with plurals and variables in them, and these are
 * proper nouns.
 *
 * # Rendered twice
 *
 * The animation moves the track by half its width, so the second copy is what
 * the reader sees arriving as the first leaves. See the comment on the keyframes
 * in globals.css for why the spacing sits inside each item instead of as a gap.
 */
export async function Marquee() {
  const t = await getTranslations('home')

  const raw = t.raw('marquee')
  const towns = Array.isArray(raw) ? (raw as string[]).filter(Boolean) : []

  // Nothing to say rather than an empty ruled band. Also what happens if the
  // key is ever removed from one language and not the other.
  if (towns.length === 0) return null

  return (
    <section aria-hidden className="border-ink-100 overflow-hidden border-y py-8 sm:py-10">
      <div className="marquee-track flex w-max items-center">
        {[...towns, ...towns].map((town, index) => (
          <span
            key={`${town}-${index}`}
            className="flex items-center gap-8 pe-8 sm:gap-12 sm:pe-12"
          >
            <span className="font-display text-ink-700 text-4xl sm:text-6xl lg:text-7xl">
              {town}
            </span>
            {/* The design's separator: a small gold square stood on its corner.
                A rotated square rather than a diamond character, so it is the
                same shape at every size and takes the brand colour from a
                class rather than from a font. */}
            <span className="bg-gold-500 block h-2 w-2 rotate-45" />
          </span>
        ))}
      </div>
    </section>
  )
}
