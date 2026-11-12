import { StoryIndex } from './editorial/StoryIndex'
import './editorial/standing-pages.css'
import { LinkArrow } from './LinkArrow'
import type { ContentPage, ContentPageSlug } from '../lib/pages'
import type { HideablePage } from '../lib/hideable-pages'
import type { Locale } from '@vardenia/i18n'
import { getTranslations } from 'next-intl/server'
import Image from 'next/image'
import { PageHero } from './editorial/PageHero'
import {
  ABOUT_HERO,
  ABOUT_HERO_ALT,
  ADD_BUSINESS_PHOTO,
  ADD_BUSINESS_PHOTO_ALT,
} from './editorial/standingPagePhotos'
import { Link } from '../i18n/routing'
import { PLACEHOLDER } from '../lib/legal'
import { groupLines } from './LegalDocument'
import { withEmphasis } from './emphasis'

/**
 * The template behind About, Contact, FAQ and the three that sell a listing.
 *
 * Deliberately the same machinery as the legal documents: `groupLines` groups
 * runs of list items and always gives an unsettled clause a block of its own, so
 * a `TO CONFIRM` on a sales page cannot be mistaken for a settled promise. That
 * matters more here than it does in the terms - a made-up price on a page a
 * business is reading is a commitment we would have to honour or explain.
 *
 * No "awaiting legal review" banner, because these are not legal documents and
 * the marker on the individual clause says enough.
 *
 * # Translated, so nothing here overrides direction any more
 *
 * These pages used to be English served under an Arabic URL, with a notice
 * saying so and `dir="ltr"` forced on the whole page. The direction was not
 * cosmetic: the layout inherits `dir="rtl"`, and the bidirectional algorithm
 * puts neutral characters at the end of the paragraph direction, so an English
 * full stop or question mark jumped to the left edge. "Is Vardenia free to use?"
 * rendered as "?Is Vardenia free to use", which reads as broken rather than as
 * untranslated.
 *
 * lib/pages now returns Arabic for an Arabic reader, so both the notice and the
 * override are gone and the page simply inherits the layout's direction. The
 * `TO CONFIRM` marker keeps its own `dir="ltr"`: it is a deliberately
 * untranslated English signal to us, and left to inherit RTL it shows the same
 * displaced-punctuation fault the rest of this comment describes.
 *
 * The legal documents are still English in both editions and still carry the
 * override. See LegalDocument.
 */

/**
 * The About page's photographs, one per section, by section index (the owner's,
 * 11 November 2026). `after` places it after the section's own paragraphs
 * ('body') or after its subsections too ('end'). Wide pictures show at 16:9,
 * portrait ones whole at their own shape.
 */
interface AboutPhoto {
  src: string
  width: number
  height: number
  after: 'body' | 'end'
  alt: Record<Locale, string>
}
const ABOUT_PHOTOS: Record<number, AboutPhoto> = {
  // The magazine, a phone and a printed code above Raouché.
  0: {
    src: '/about/print-meets-digital.webp',
    width: 1280,
    height: 720,
    after: 'end',
    alt: {
      en: 'The Vardenia magazine, a phone showing the Vardenia site and a printed QR code on a table above the sea at Raouché',
      ar: 'مجلة فاردينيا وهاتف يعرض موقع فاردينيا ورمز QR مطبوع على طاولة تطلّ على البحر عند الروشة',
      fr: 'Le magazine Vardenia, un téléphone affichant le site Vardenia et un code QR imprimé sur une table face à la mer, à Raouché',
      es: 'La revista Vardenia, un teléfono con el sitio de Vardenia y un código QR impreso sobre una mesa frente al mar en Raouché',
      pt: 'A revista Vardenia, um telemóvel com o site da Vardenia e um código QR impresso numa mesa sobre o mar em Raouché',
      ru: 'Журнал Vardenia, телефон с сайтом Vardenia и напечатанный QR-код на столе над морем у Рауше',
      zh: '劳谢海边的桌上，摆着 Vardenia 杂志、显示 Vardenia 网站的手机和一张印刷的二维码',
      hi: 'रौशे में समुद्र के ऊपर एक मेज़ पर Vardenia पत्रिका, Vardenia साइट दिखाता फ़ोन और छपा हुआ QR कोड',
      bn: 'রাউশেতে সমুদ্রের ওপরে একটি টেবিলে Vardenia ম্যাগাজিন, Vardenia সাইট দেখানো একটি ফোন আর ছাপা QR কোড',
      ur: 'روشہ میں سمندر کے اوپر ایک میز پر Vardenia میگزین، Vardenia سائٹ دکھاتا فون اور چھپا ہوا QR کوڈ',
    },
  },
  // Postcards of Lebanon, a checklist and the site on a phone, above Byblos.
  // After the opening paragraphs since 12 November 2026, so it does not follow
  // the bottle under Our Commitment.
  1: {
    src: '/about/curated-experiences.webp',
    width: 1280,
    height: 720,
    after: 'body',
    alt: {
      en: 'Postcards of Baalbek, a Lebanese lane, the cedars, Raouché and a candlelit courtyard on a table above the sea at Byblos, beside a checklist and a phone showing Vardenia',
      ar: 'بطاقات بريدية لبعلبك وزقاق لبناني والأرز والروشة وباحة مضاءة بالشموع على طاولة تطلّ على البحر في جبيل، إلى جانب قائمة مهامّ وهاتف يعرض فاردينيا',
      fr: 'Des cartes postales de Baalbek, d’une ruelle libanaise, des cèdres, de Raouché et d’une cour aux chandelles sur une table face à la mer à Byblos, près d’une liste et d’un téléphone affichant Vardenia',
      es: 'Postales de Baalbek, una calle libanesa, los cedros, Raouché y un patio a la luz de las velas sobre una mesa frente al mar en Biblos, junto a una lista y un teléfono con Vardenia',
      pt: 'Postais de Baalbek, de uma rua libanesa, dos cedros, de Raouché e de um pátio à luz das velas numa mesa sobre o mar em Biblos, junto a uma lista e a um telemóvel com a Vardenia',
      ru: 'Открытки с Баальбеком, ливанской улочкой, кедрами, Рауше и двориком при свечах на столе над морем в Библе, рядом со списком дел и телефоном с Vardenia',
      zh: '比布鲁斯海边的桌上，摆着巴尔贝克、黎巴嫩小巷、雪松、劳谢和烛光庭院的明信片，旁边是一份清单和显示 Vardenia 的手机',
      hi: 'बिब्लोस में समुद्र के ऊपर एक मेज़ पर बालबेक, एक लेबनानी गली, देवदार, रौशे और मोमबत्तियों से सजे आँगन के पोस्टकार्ड, पास में एक सूची और Vardenia दिखाता फ़ोन',
      bn: 'বিবলোসে সমুদ্রের ওপরে একটি টেবিলে বালবেক, একটি লেবানিজ গলি, সিডার, রাউশে আর মোমবাতির আলোয় সাজানো উঠোনের পোস্টকার্ড, পাশে একটি তালিকা ও Vardenia দেখানো একটি ফোন',
      ur: 'جبیل میں سمندر کے اوپر ایک میز پر بعلبک، ایک لبنانی گلی، دیودار، روشہ اور شمعوں سے روشن صحن کے پوسٹ کارڈ، پاس ایک فہرست اور Vardenia دکھاتا فون',
    },
  },
  // The All Lebanon issue, held in the light between two hands.
  2: {
    src: '/about/vardenia-story.webp',
    width: 1122,
    height: 1402,
    after: 'body',
    alt: {
      en: 'The All Lebanon issue of Vardenia, Discover Lebanon on its cover, held in the light between two open hands',
      ar: 'عدد كلّ لبنان من فاردينيا، وعلى غلافه «اكتشف لبنان»، معلّقاً في الضوء بين يدين مفتوحتين',
      fr: 'L’édition All Lebanon de Vardenia, « Discover Lebanon » en couverture, suspendue dans la lumière entre deux mains ouvertes',
      es: 'La edición All Lebanon de Vardenia, con «Discover Lebanon» en la portada, suspendida en la luz entre dos manos abiertas',
      pt: 'A edição All Lebanon da Vardenia, com «Discover Lebanon» na capa, suspensa na luz entre duas mãos abertas',
      ru: 'Выпуск All Lebanon журнала Vardenia с надписью Discover Lebanon на обложке, парящий в луче света между двумя раскрытыми ладонями',
      zh: '封面写着 Discover Lebanon 的 Vardenia All Lebanon 期杂志，悬在光中，两只张开的手之间',
      hi: 'Vardenia का All Lebanon अंक, आवरण पर Discover Lebanon, रोशनी में दो खुली हथेलियों के बीच',
      bn: 'Vardenia-র All Lebanon সংখ্যা, প্রচ্ছদে Discover Lebanon, আলোর মধ্যে দুটি খোলা হাতের মাঝে',
      ur: 'Vardenia کا All Lebanon شمارہ، سرورق پر Discover Lebanon، روشنی میں دو کھلے ہاتھوں کے درمیان',
    },
  },
}

/** A list item that is nothing but a bold title: "- **Reliable Information**". */
const TITLE_ONLY = /^- \*\*([^*]+)\*\*$/

/**
 * Photographs placed inside a section's text with a line "@ name" (About's Our
 * Commitment, 12 November 2026), where a section-end photo would land after
 * the closing line instead of after the list.
 */
const INLINE_PHOTOS: Record<string, AboutPhoto> = {
  'message-in-a-bottle': {
    src: '/about/message-in-a-bottle.webp',
    width: 1533,
    height: 1026,
    after: 'body',
    alt: {
      en: 'Copies of Vardenia All Lebanon rolled into a corked glass bottle on the sand at sunset, the sea behind',
      ar: 'نسخ من فاردينيا كلّ لبنان داخل قارورة زجاجية مسدودة بالفلّين على الرمل عند الغروب، والبحر خلفها',
      fr: 'Des numéros de Vardenia All Lebanon glissés dans une bouteille bouchée de liège, sur le sable au coucher du soleil, la mer derrière',
      es: 'Ejemplares de Vardenia All Lebanon dentro de una botella con tapón de corcho sobre la arena al atardecer, con el mar detrás',
      pt: 'Exemplares da Vardenia All Lebanon dentro de uma garrafa rolhada com cortiça, na areia ao pôr do sol, com o mar atrás',
      ru: 'Номера Vardenia All Lebanon в стеклянной бутылке с пробкой на песке на закате, позади море',
      zh: '几本 Vardenia All Lebanon 杂志装在一只软木塞玻璃瓶里，躺在日落时的沙滩上，身后是大海',
      hi: 'सूर्यास्त में रेत पर कॉर्क लगी काँच की बोतल में रखी Vardenia All Lebanon की प्रतियाँ, पीछे समुद्र',
      bn: 'সূর্যাস্তে বালির ওপর কর্ক আঁটা কাচের বোতলে Vardenia All Lebanon-এর কয়েকটি সংখ্যা, পেছনে সমুদ্র',
      ur: 'غروبِ آفتاب میں ریت پر کارک لگی شیشے کی بوتل میں Vardenia All Lebanon کی کاپیاں، پیچھے سمندر',
    },
  },
}

function aboutPhoto(photo: AboutPhoto, locale: Locale) {
  const portrait = photo.height > photo.width
  return (
    <figure
      className={`vd-story-photograph ${portrait ? 'vd-story-photograph-portrait' : 'vd-story-photograph-wide'}`}
      data-vd-reveal
    >
      <Image
        src={photo.src}
        alt={photo.alt[locale] ?? photo.alt.en}
        width={photo.width}
        height={photo.height}
        sizes={portrait ? '(max-width:700px) 100vw, 480px' : '(max-width:700px) 100vw, 60vw'}
      />
    </figure>
  )
}

function Line({ text, id }: { text: string; id: string }) {
  const isList = text.startsWith('- ')
  const body = isList ? text.slice(2) : text

  if (body.includes(PLACEHOLDER)) {
    return (
      /**
       * The one block that stays English on an Arabic page, so the one that
       * still pins its direction. These describe a decision nobody has made
       * yet - a price, a print deadline - and they are notes to ourselves that
       * happen to be visible. Left to inherit RTL, their full stops would jump
       * to the left edge, which is the exact fault the rest of this file was
       * changed to remove.
       */
      <p
        dir="ltr"
        lang="en"
        className="border-state-warning bg-gold-100 text-ink-900 my-4 border-s-4 px-4 py-3 text-start text-sm"
      >
        <span className="text-state-warning me-2 text-sm font-semibold">Not settled</span>
        {body.replace(`${PLACEHOLDER} `, '')}
      </p>
    )
  }

  if (isList) {
    return <li className="text-ink-700 mt-2 leading-relaxed">{withEmphasis(body, id)}</li>
  }

  // A pull quote: a tagline or a line the owner set in italics (About).
  if (body.startsWith('> ')) {
    return <p className="vd-story-quote">{withEmphasis(body.slice(2), id)}</p>
  }

  // The closing signature: the wordmark over a last line (About).
  if (body.startsWith('~ ')) {
    return (
      <p className="vd-story-signoff">
        <span aria-hidden="true">VARDENIA</span>
        {body.slice(2)}
      </p>
    )
  }

  return <p className="text-ink-700 mt-4 leading-relaxed">{withEmphasis(body, id)}</p>
}

/**
 * No locale prop any more: lib/pages already returned the right language, and a
 * component that takes both the copy and the language it is in has two sources
 * of truth for one fact.
 */
export async function ContentPageView({
  page,
  slug = 'about',
  locale = 'en',
  hidden = [],
}: {
  page: ContentPage
  slug?: ContentPageSlug
  locale?: Locale
  /** Pages hidden from the admin (lib/hidden-pages): never linked to. */
  hidden?: readonly HideablePage[]
}) {
  const t = await getTranslations({ locale })
  const faq = slug === 'faq'
  // The buttons at the foot point at the directory when Contact is hidden, and
  // the second link is left out when the page it names is hidden. With the
  // directory hidden as well, the first goes home.
  const toDirectory = slug === 'about' || slug === 'contact' || faq || hidden.includes('contact')
  const directoryShown = !hidden.includes('directory')
  const next =
    toDirectory && !directoryShown
      ? { href: '/', label: t('common.homepage') }
      : {
          href: toDirectory ? '/directory' : '/contact',
          label: t(toDirectory ? 'nav.directory' : 'nav.contact'),
        }
  const other: ContentPageSlug = faq ? 'about' : 'faq'
  const showOther = !hidden.includes(other)
  const place = {
    about: 1,
    contact: 2,
    faq: 0,
    'add-your-business': 0,
    'partner-with-us': 5,
    advertise: 3,
  }[slug]
  const body = (section: ContentPage['sections'][number], sectionIndex: number) =>
    groupLines(section.body).map((group, groupIndex) => {
      const id = `${sectionIndex}-${groupIndex}`
      // "@ name": one of the About page's photographs, inside a section's text.
      const inline = group.kind === 'single' ? group.lines[0]?.match(/^@ (\S+)$/) : null
      if (inline) {
        const photo = INLINE_PHOTOS[inline[1]!]
        return photo ? <div key={id}>{aboutPhoto(photo, locale)}</div> : null
      }
      // A list whose items are only bold titles: numbered, between hairlines.
      if (group.kind === 'list' && group.lines.every((line) => TITLE_ONLY.test(line))) {
        return (
          <ol key={id} className="vd-story-titles">
            {group.lines.map((line, itemIndex) => (
              <li key={`${id}-${itemIndex}`}>{line.replace(TITLE_ONLY, '$1')}</li>
            ))}
          </ol>
        )
      }
      return group.kind === 'list' ? (
        <ul key={id} className="list-disc ps-6">
          {group.lines.map((item, itemIndex) => (
            <Line key={`${id}-${itemIndex}`} text={item} id={`${id}-${itemIndex}`} />
          ))}
        </ul>
      ) : (
        <Line key={id} text={group.lines[0]} id={id} />
      )
    })
  return (
    <main className={`vd-standing-page vd-standing-${slug}`}>
      <PageHero
        title={page.title}
        intro={page.intro}
        place={place}
        // About's own picture since 11 November 2026, the seven regional doors
        // and the All Lebanon issue. Portrait, so it sits beside the title whole
        // rather than behind it, where a wide crop would cut it to a strip.
        // Add your business has its own too (the owner's, the same day), also
        // portrait.
        photo={
          slug === 'about'
            ? { ...ABOUT_HERO, alt: ABOUT_HERO_ALT[locale] }
            : slug === 'add-your-business'
              ? { ...ADD_BUSINESS_PHOTO, alt: ADD_BUSINESS_PHOTO_ALT[locale] }
              : undefined
        }
        locale={locale}
      >
        <a href="#page-story" className="vd-button">
          {page.sections[0]?.heading} <span aria-hidden>↓</span>
        </a>
      </PageHero>
      <div className="vd-story-layout" id="page-story">
        <aside className="vd-story-index">
          <StoryIndex
            title={page.title}
            sections={page.sections.map((section, i) => ({
              id: `story-${i}`,
              heading: section.heading,
            }))}
          />
          <Link href={next.href} className="vd-button">
            {next.label}{' '}
            <span aria-hidden>
              <LinkArrow />
            </span>
          </Link>
        </aside>
        <div className="vd-content-sections">
          {page.sections.map((section, i) =>
            faq ? (
              <details
                className="vd-question"
                key={section.heading}
                id={`story-${i}`}
                open={i === 0}
              >
                <summary>
                  <h2>{section.heading}</h2>
                  <span className="vd-question-sign" aria-hidden>
                    +
                  </span>
                </summary>
                <div className="vd-story-body">{body(section, i)}</div>
              </details>
            ) : (
              <section
                className="vd-story-section"
                key={section.heading}
                id={`story-${i}`}
                tabIndex={-1}
              >
                <span className="vd-section-number" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h2>{section.heading}</h2>
                <div className="vd-story-body">{body(section, i)}</div>
                {slug === 'about' && ABOUT_PHOTOS[i]?.after === 'body'
                  ? aboutPhoto(ABOUT_PHOTOS[i]!, locale)
                  : null}
                {section.subsections?.map((part, partIndex) => (
                  <div className="vd-story-subsection" key={part.heading}>
                    <h3>{part.heading}</h3>
                    <div className="vd-story-body">{body(part, i * 100 + partIndex + 1)}</div>
                  </div>
                ))}
                {slug === 'about' && ABOUT_PHOTOS[i]?.after === 'end'
                  ? aboutPhoto(ABOUT_PHOTOS[i]!, locale)
                  : null}
              </section>
            ),
          )}
          <nav className="vd-story-next" aria-label={page.title}>
            <Link href={next.href} className="vd-button">
              {next.label}
              <LinkArrow />
            </Link>
            {showOther ? (
              <Link href={`/${other}`} className="vd-text-link">
                {t(faq ? 'nav.about' : 'nav.questions')}
                <LinkArrow />
              </Link>
            ) : null}
          </nav>
        </div>
      </div>
    </main>
  )
}
