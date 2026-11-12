import type { Locale } from '@vardenia/i18n'
import type { LegalDocument } from './legal'
import { TBD, contactEmail, contactPostal } from './placeholder'

/**
 * The standing pages: About, Contact, FAQ, and the three that sell a listing.
 *
 * # Why these matter more than they look
 *
 * A restaurant owner sees the magazine, wants to be in the next issue, and goes
 * looking for how. Until now that ended in a 404. The partner sign-in exists for
 * businesses already sold to; there was nothing at all for the ones selling
 * themselves to us, which is the top of the revenue funnel.
 *
 * # In code, like the legal documents
 *
 * The Pages collection that used to hold standing pages is gone. It could come
 * back, and for marketing copy there is a real argument for it - somebody in the
 * team will want to reword this without waiting for a deploy.
 *
 * Code for now, for one reason: this copy makes commitments. What a listing
 * includes, what verification means, how long a code lasts. Those are promises
 * that should change through a reviewed diff, the same as the terms they sit
 * next to, and the version live on a given day should be recoverable from git
 * when somebody disputes what they were sold. Revisit when the copy settles and
 * the changes become cosmetic.
 *
 * # Unsettled facts are marked, not invented
 *
 * Same `TO CONFIRM` marker as the legal documents, rendered as a block that
 * cannot be mistaken for body text. Prices, print deadlines and the contact
 * address are not mine to make up, and a plausible invented number on a sales
 * page is worse than a visible gap. The marker stays English in every language
 * - lib/legal counts unresolved clauses by matching it.
 *
 * # Every language, in one file
 *
 * Each builder takes a locale and returns that language's copy. The pages used
 * to be English under an Arabic URL, which was worse than it sounds: the layout
 * is RTL, and the bidirectional algorithm moves an English sentence's full stop
 * to the left edge, so "Is Vardenia free to use?" rendered as
 * "?Is Vardenia free to use" and read as broken rather than as untranslated.
 *
 * Then the site gained eight more languages and these pages did not: `pick`
 * took an English and an Arabic value and gave every other language the
 * English one. /fr/about rendered a French header over an English page.
 *
 * So `pick` now takes a record of all ten, and the compiler refuses one with a
 * language missing. A sentence cannot be added or changed in English alone -
 * which is the point, because a changed promise that ships in one language is
 * the pages promising different things to different readers. The versions stay
 * side by side for the same reason: a translation in another file is a
 * translation that drifts.
 *
 * # Who wrote the translations
 *
 * The Arabic is a translation of meaning, not of words, and it has not been
 * reviewed by a native speaker. The other eight were written in September 2026
 * to the same brief, and have not been reviewed either. They follow each
 * language's existing interface wording - the page and menu names in bold are
 * that language's own labels, from packages/i18n/src/messages - and keep
 * "Vardenia" in Latin script, as the menus do. They should be reviewed before
 * launch: these pages carry commercial commitments, and a mistranslated promise
 * is still a promise.
 *
 * The legal documents are translated too since 9 November 2026, in
 * lib/legal-translations, each saying that the English governs. See lib/legal.
 */

export type ContentPage = LegalDocument

type Builder = (locale: Locale) => ContentPage

/** Every standing page, keyed by its URL segment. */
export const CONTENT_PAGES = {
  about: aboutPage,
  contact: contactPage,
  faq: faqPage,
  'partner-with-us': partnerWithUsPage,
  advertise: advertisePage,
  'add-your-business': addYourBusinessPage,
} as const satisfies Record<string, Builder>

export type ContentPageSlug = keyof typeof CONTENT_PAGES

export const CONTENT_PAGE_SLUGS = Object.keys(CONTENT_PAGES) as ContentPageSlug[]

export function contentPage(slug: string, locale: Locale = 'en'): ContentPage | null {
  const build = CONTENT_PAGES[slug as ContentPageSlug]
  return build ? build(locale) : null
}

/**
 * Picks a language from a record of every language.
 *
 * Named for what it does at the call site rather than for its types, because it
 * appears once per section and the copy is what should be readable there. The
 * record type is the whole safeguard: leave out a language and it does not
 * compile.
 */
const pick = <T>(locale: Locale, byLocale: Record<Locale, T>): T => byLocale[locale]

// --------------------------------------------------------------------- about

export function aboutPage(locale: Locale = 'en'): ContentPage {
  return {
    title: pick(locale, {
      en: 'About Vardenia',
      ar: 'عن فاردينيا',
      fr: 'À propos de Vardenia',
      es: 'Acerca de Vardenia',
      pt: 'Sobre a Vardenia',
      ru: 'О Vardenia',
      zh: '关于 Vardenia',
      hi: 'Vardenia के बारे में',
      bn: 'Vardenia সম্পর্কে',
      ur: 'Vardenia کے بارے میں',
    }),
    intro: pick(locale, {
      en: 'Vardenia is a printed magazine and an online directory of places worth going in Lebanon. The two are one product: what is in the magazine is on the site, and every listing in print carries a code that opens it.',
      ar: 'فاردينيا مجلة مطبوعة ودليل إلكتروني للأماكن التي تستحق الزيارة في لبنان. الاثنان منتج واحد: ما تجده في المجلة تجده على الموقع، وكل مكان مدرج في النسخة المطبوعة يحمل رمزاً يفتح صفحته.',
      fr: "Vardenia est un magazine imprimé et un annuaire en ligne des lieux qui valent le détour au Liban. Les deux ne font qu'un : ce qui est dans le magazine est sur le site, et chaque fiche imprimée porte un code qui l'ouvre.",
      es: 'Vardenia es una revista impresa y un directorio en línea de los lugares que merecen la pena en el Líbano. Las dos cosas son un solo producto: lo que está en la revista está en el sitio, y cada ficha impresa lleva un código que la abre.',
      pt: 'A Vardenia é uma revista impressa e um diretório online de lugares que valem a visita no Líbano. As duas coisas são um só produto: o que está na revista está no site, e cada ficha impressa traz um código que a abre.',
      ru: 'Vardenia — это печатный журнал и онлайн-справочник мест в Ливане, куда стоит сходить. Это один продукт: всё, что есть в журнале, есть и на сайте, а у каждой карточки в печатной версии есть код, который её открывает.',
      zh: 'Vardenia 是一本印刷杂志，也是一份黎巴嫩值得一去之处的在线指南。两者是同一件产品：杂志里有的，网站上都有；印刷版上的每个商户都附有一个二维码，扫码即可打开它的页面。',
      hi: 'Vardenia एक छपी हुई पत्रिका और लेबनान की उन जगहों की ऑनलाइन निर्देशिका है जहाँ जाना सार्थक है। दोनों एक ही उत्पाद हैं: जो पत्रिका में है वह साइट पर है, और छपी हुई हर लिस्टिंग पर एक कोड है जो उसे खोलता है।',
      bn: 'Vardenia একটি ছাপা ম্যাগাজিন এবং লেবাননের ঘুরে দেখার মতো জায়গাগুলোর একটি অনলাইন ডিরেক্টরি। দুটো মিলে একটাই পণ্য: ম্যাগাজিনে যা আছে তা সাইটেও আছে, আর ছাপা প্রতিটি লিস্টিংয়ে একটি কোড থাকে যা সেটি খুলে দেয়।',
      ur: 'Vardenia ایک چھپا ہوا میگزین اور لبنان کے اُن مقامات کی آن لائن ڈائریکٹری ہے جہاں جانا بنتا ہے۔ دونوں ایک ہی چیز ہیں: جو میگزین میں ہے وہ سائٹ پر ہے، اور چھپی ہوئی ہر لسٹنگ پر ایک کوڈ ہوتا ہے جو اسے کھول دیتا ہے۔',
    }),
    sections: [
      {
        heading: pick(locale, {
          en: 'Why Print in a Digital World?',
          ar: 'لماذا المطبوع في عالم رقمي؟',
          fr: 'Pourquoi l’imprimé dans un monde numérique ?',
          es: '¿Por qué el papel en un mundo digital?',
          pt: 'Porquê o impresso num mundo digital?',
          ru: 'Зачем печать в цифровом мире?',
          zh: '为什么在数字时代坚持印刷？',
          hi: 'डिजिटल दुनिया में छपाई क्यों?',
          bn: 'ডিজিটাল দুনিয়ায় ছাপা কেন?',
          ur: 'ڈیجیٹل دنیا میں چھپائی کیوں؟',
        }),
        body: pick(locale, {
          en: [
            'Because meaningful experiences deserve more than a fleeting moment on a screen.',
            'In an increasingly digital world, Vardenia believes in the lasting value of print. A beautifully curated magazine offers something unique: a tangible source of inspiration that travelers can discover, explore, and return to throughout their journey.',
          ],
          ar: [
            'لأن التجارب ذات المعنى تستحقّ أكثر من لحظة عابرة على شاشة.',
            'في عالم يزداد رقمية، تؤمن فاردينيا بالقيمة الدائمة للمطبوع. فالمجلة المختارة بعناية تقدّم شيئاً فريداً: مصدر إلهام ملموساً يكتشفه المسافر ويستكشفه ويعود إليه طوال رحلته.',
          ],
          fr: [
            'Parce que les expériences qui comptent méritent plus qu’un instant fugace sur un écran.',
            'Dans un monde de plus en plus numérique, Vardenia croit à la valeur durable de l’imprimé. Un magazine soigneusement composé offre quelque chose d’unique : une source d’inspiration tangible que les voyageurs découvrent, explorent et retrouvent tout au long de leur séjour.',
          ],
          es: [
            'Porque las experiencias que importan merecen algo más que un instante fugaz en una pantalla.',
            'En un mundo cada vez más digital, Vardenia cree en el valor duradero del papel. Una revista cuidadosamente elaborada ofrece algo único: una fuente de inspiración tangible que los viajeros pueden descubrir, explorar y volver a consultar durante todo su viaje.',
          ],
          pt: [
            'Porque as experiências que importam merecem mais do que um momento fugaz num ecrã.',
            'Num mundo cada vez mais digital, a Vardenia acredita no valor duradouro do impresso. Uma revista cuidadosamente feita oferece algo único: uma fonte de inspiração tangível que os viajantes podem descobrir, explorar e voltar a consultar ao longo de toda a viagem.',
          ],
          ru: [
            'Потому что настоящие впечатления заслуживают большего, чем мимолётный миг на экране.',
            'В мире, который становится всё более цифровым, Vardenia верит в долговечную ценность печати. Тщательно собранный журнал даёт нечто особенное: осязаемый источник вдохновения, который путешественник может открыть, изучить и к которому может возвращаться на протяжении всей поездки.',
          ],
          zh: [
            '因为有意义的体验，值得的不只是屏幕上转瞬即逝的一刻。',
            '在日益数字化的世界里，Vardenia 相信印刷的持久价值。一本精心策划的杂志能带来独特的东西：一份可以握在手中的灵感来源，让旅行者在整个旅程中发现、探索并反复翻阅。',
          ],
          hi: [
            'क्योंकि सार्थक अनुभव स्क्रीन पर एक क्षणिक पल से कहीं ज़्यादा के हक़दार हैं।',
            'लगातार डिजिटल होती दुनिया में Vardenia छपे हुए शब्द के स्थायी मूल्य में विश्वास करती है। ध्यान से तैयार की गई एक पत्रिका कुछ अनोखा देती है: प्रेरणा का एक ठोस स्रोत, जिसे यात्री पूरी यात्रा के दौरान खोज सकते हैं, पढ़ सकते हैं और बार-बार लौटकर देख सकते हैं।',
          ],
          bn: [
            'কারণ অর্থপূর্ণ অভিজ্ঞতা পর্দায় এক ঝলক মুহূর্তের চেয়ে বেশি কিছু পাওয়ার যোগ্য।',
            'ক্রমশ ডিজিটাল হয়ে ওঠা পৃথিবীতে Vardenia ছাপা মাধ্যমের স্থায়ী মূল্যে বিশ্বাস করে। যত্ন করে সাজানো একটি ম্যাগাজিন অনন্য কিছু দেয়: অনুপ্রেরণার একটি হাতে ধরা উৎস, যা ভ্রমণকারীরা পুরো যাত্রায় আবিষ্কার করতে, ঘুরে দেখতে আর বারবার ফিরে পড়তে পারেন।',
          ],
          ur: [
            'کیونکہ بامعنی تجربات اسکرین پر ایک گزرتے لمحے سے کہیں زیادہ کے حق دار ہیں۔',
            'تیزی سے ڈیجیٹل ہوتی دنیا میں Vardenia چھپے ہوئے لفظ کی دیرپا قدر پر یقین رکھتا ہے۔ سلیقے سے ترتیب دیا گیا میگزین کچھ منفرد پیش کرتا ہے: تحریک کا ایک ٹھوس ذریعہ، جسے مسافر پورے سفر میں دریافت کر سکتے ہیں، کھوج سکتے ہیں اور بار بار پلٹ کر دیکھ سکتے ہیں۔',
          ],
        }),
        subsections: [
          {
            heading: pick(locale, {
              en: 'Where Print Meets Digital',
              ar: 'حيث يلتقي المطبوع بالرقمي',
              fr: 'Là où l’imprimé rencontre le numérique',
              es: 'Donde el papel se encuentra con lo digital',
              pt: 'Onde o impresso encontra o digital',
              ru: 'Где печать встречается с цифрой',
              zh: '印刷与数字的交汇',
              hi: 'जहाँ छपाई डिजिटल से मिलती है',
              bn: 'যেখানে ছাপা মেলে ডিজিটালের সঙ্গে',
              ur: 'جہاں چھپائی ڈیجیٹل سے ملتی ہے',
            }),
            body: pick(locale, {
              en: [
                'Vardenia combines the elegance of a printed publication with the convenience of a modern digital platform.',
                'Through integrated QR codes, readers can instantly access updated business information, explore services, discover locations, and connect directly with featured destinations.',
                'Our magazine creates the first impression. Our digital platform keeps the connection alive.',
              ],
              ar: [
                'تجمع فاردينيا بين أناقة المطبوعة وسهولة منصّة رقمية حديثة.',
                'بفضل رموز QR المدمجة، يصل القرّاء فوراً إلى معلومات محدّثة عن الأعمال، ويستكشفون الخدمات، ويكتشفون المواقع، ويتواصلون مباشرة مع الوجهات المعروضة.',
                'مجلتنا تصنع الانطباع الأول. ومنصّتنا الرقمية تُبقي الصلة حيّة.',
              ],
              fr: [
                'Vardenia allie l’élégance d’une publication imprimée à la commodité d’une plateforme numérique moderne.',
                'Grâce aux codes QR intégrés, les lecteurs accèdent instantanément à des informations à jour sur les établissements, découvrent leurs services et leur emplacement, et contactent directement les lieux présentés.',
                'Notre magazine crée la première impression. Notre plateforme numérique fait vivre le lien.',
              ],
              es: [
                'Vardenia combina la elegancia de una publicación impresa con la comodidad de una plataforma digital moderna.',
                'Gracias a los códigos QR integrados, los lectores acceden al instante a información actualizada de los negocios, exploran sus servicios, descubren su ubicación y contactan directamente con los destinos destacados.',
                'Nuestra revista crea la primera impresión. Nuestra plataforma digital mantiene viva la conexión.',
              ],
              pt: [
                'A Vardenia junta a elegância de uma publicação impressa à conveniência de uma plataforma digital moderna.',
                'Através dos códigos QR integrados, os leitores acedem de imediato a informação atualizada sobre os negócios, exploram os serviços, descobrem a localização e contactam diretamente os destinos apresentados.',
                'A nossa revista cria a primeira impressão. A nossa plataforma digital mantém a ligação viva.',
              ],
              ru: [
                'Vardenia сочетает элегантность печатного издания с удобством современной цифровой платформы.',
                'Благодаря встроенным QR-кодам читатели сразу получают актуальную информацию о заведениях, узнают об услугах, находят адреса и напрямую связываются с представленными местами.',
                'Наш журнал создаёт первое впечатление. Наша цифровая платформа поддерживает связь.',
              ],
              zh: [
                'Vardenia 将印刷出版物的优雅与现代数字平台的便捷结合在一起。',
                '通过嵌入的二维码，读者可以即时获取最新的商家信息、了解服务、找到位置，并直接联系杂志介绍的目的地。',
                '我们的杂志留下第一印象，我们的数字平台让这份联系延续下去。',
              ],
              hi: [
                'Vardenia एक छपे हुए प्रकाशन की सुंदरता को आधुनिक डिजिटल प्लेटफ़ॉर्म की सुविधा के साथ जोड़ती है।',
                'पत्रिका में जुड़े QR कोड के ज़रिए पाठक तुरंत व्यवसायों की ताज़ा जानकारी देख सकते हैं, सेवाएँ जान सकते हैं, जगहें खोज सकते हैं और प्रस्तुत जगहों से सीधे जुड़ सकते हैं।',
                'हमारी पत्रिका पहली छाप छोड़ती है। हमारा डिजिटल प्लेटफ़ॉर्म इस जुड़ाव को बनाए रखता है।',
              ],
              bn: [
                'Vardenia ছাপা প্রকাশনার সৌন্দর্যকে আধুনিক ডিজিটাল প্ল্যাটফর্মের সুবিধার সঙ্গে মিলিয়েছে।',
                'ম্যাগাজিনে থাকা QR কোডের মাধ্যমে পাঠকেরা সঙ্গে সঙ্গে ব্যবসার হালনাগাদ তথ্য দেখতে, সেবাগুলো জানতে, অবস্থান খুঁজে পেতে আর উপস্থাপিত গন্তব্যের সঙ্গে সরাসরি যোগাযোগ করতে পারেন।',
                'আমাদের ম্যাগাজিন প্রথম ছাপটা তৈরি করে। আমাদের ডিজিটাল প্ল্যাটফর্ম সেই সংযোগ বাঁচিয়ে রাখে।',
              ],
              ur: [
                'Vardenia ایک چھپی ہوئی اشاعت کی نفاست کو ایک جدید ڈیجیٹل پلیٹ فارم کی سہولت کے ساتھ جوڑتا ہے۔',
                'میگزین میں شامل QR کوڈز کے ذریعے قارئین فوراً کاروبار کی تازہ معلومات دیکھ سکتے ہیں، خدمات جان سکتے ہیں، مقامات تلاش کر سکتے ہیں اور پیش کی گئی منزلوں سے براہِ راست رابطہ کر سکتے ہیں۔',
                'ہمارا میگزین پہلا تاثر بناتا ہے۔ ہمارا ڈیجیٹل پلیٹ فارم اس تعلق کو قائم رکھتا ہے۔',
              ],
            }),
          },
          {
            heading: pick(locale, {
              en: 'More Than a Magazine',
              ar: 'أكثر من مجلة',
              fr: 'Plus qu’un magazine',
              es: 'Más que una revista',
              pt: 'Mais do que uma revista',
              ru: 'Больше, чем журнал',
              zh: '不只是一本杂志',
              hi: 'एक पत्रिका से कहीं बढ़कर',
              bn: 'একটি ম্যাগাজিনের চেয়েও বেশি',
              ur: 'ایک میگزین سے بڑھ کر',
            }),
            body: pick(locale, {
              en: [
                "Vardenia is a bridge between travelers and Lebanon's tourism industry, offering businesses meaningful visibility while inspiring visitors to discover the country with confidence.",
              ],
              ar: [
                'فاردينيا جسر بين المسافرين وقطاع السياحة في لبنان، تمنح الأعمال حضوراً ذا معنى، وتُلهم الزوّار لاكتشاف البلد بثقة.',
              ],
              fr: [
                'Vardenia est un pont entre les voyageurs et le secteur du tourisme au Liban : il offre aux établissements une visibilité qui compte, tout en donnant aux visiteurs l’envie de découvrir le pays en toute confiance.',
              ],
              es: [
                'Vardenia es un puente entre los viajeros y el sector turístico del Líbano: ofrece a los negocios una visibilidad que cuenta e inspira a los visitantes a descubrir el país con confianza.',
              ],
              pt: [
                'A Vardenia é uma ponte entre os viajantes e o setor do turismo do Líbano: dá aos negócios uma visibilidade que conta e inspira os visitantes a descobrir o país com confiança.',
              ],
              ru: [
                'Vardenia становится мостом между путешественниками и туристической отраслью Ливана: даёт заведениям заметность, которая имеет значение, и вдохновляет гостей открывать страну с уверенностью.',
              ],
              zh: [
                'Vardenia 是旅行者与黎巴嫩旅游业之间的桥梁，为商家带来有意义的曝光，也激励旅行者满怀信心地探索这个国家。',
              ],
              hi: [
                'Vardenia यात्रियों और लेबनान के पर्यटन उद्योग के बीच एक पुल है, जो व्यवसायों को सार्थक पहचान देती है और मेहमानों को भरोसे के साथ देश खोजने की प्रेरणा देती है।',
              ],
              bn: [
                'Vardenia ভ্রমণকারী আর লেবাননের পর্যটন শিল্পের মধ্যে একটি সেতু, যা ব্যবসাগুলোকে অর্থপূর্ণ পরিচিতি দেয় এবং অতিথিদের আত্মবিশ্বাসের সঙ্গে দেশটি আবিষ্কারে অনুপ্রাণিত করে।',
              ],
              ur: [
                'Vardenia مسافروں اور لبنان کی سیاحتی صنعت کے درمیان ایک پل ہے، جو کاروباروں کو بامعنی پہچان دیتا ہے اور مہمانوں کو اعتماد کے ساتھ ملک دریافت کرنے کی ترغیب دیتا ہے۔',
              ],
            }),
          },
        ],
      },
      {
        heading: pick(locale, {
          en: 'Thoughtfully Curated Experiences',
          ar: 'تجارب مختارة بعناية',
          fr: 'Des expériences choisies avec soin',
          es: 'Experiencias cuidadosamente seleccionadas',
          pt: 'Experiências escolhidas com cuidado',
          ru: 'Тщательно отобранные впечатления',
          zh: '用心精选的体验',
          hi: 'सोच-समझकर चुने गए अनुभव',
          bn: 'যত্নে বাছাই করা অভিজ্ঞতা',
          ur: 'سوچ سمجھ کر منتخب کیے گئے تجربات',
        }),
        /**
         * The owner's text of 11 November 2026, replacing "Curated, not
         * crowdsourced". A line starting "> " is a pull quote (ContentPage).
         */
        body: pick(locale, {
          en: [
            '> Discover Lebanon through carefully selected places, trusted information, and authentic experiences.',
            'At Vardenia, we believe that discovering exceptional destinations should be effortless, inspiring, and reliable.',
            "Our mission is to connect travelers with Lebanon's distinctive hotels, guesthouses, restaurants, attractions, and experiences through a platform built on quality and transparency.",
          ],
          ar: [
            '> اكتشف لبنان من خلال أماكن مختارة بعناية، ومعلومات موثوقة، وتجارب أصيلة.',
            'نؤمن في فاردينيا بأن اكتشاف الوجهات الاستثنائية يجب أن يكون سهلاً وملهماً وموثوقاً.',
            'مهمّتنا أن نصل المسافرين بفنادق لبنان وبيوت ضيافته ومطاعمه ومعالمه وتجاربه المميّزة، عبر منصّة قائمة على الجودة والشفافية.',
          ],
          fr: [
            '> Découvrez le Liban à travers des lieux choisis avec soin, des informations fiables et des expériences authentiques.',
            'Chez Vardenia, nous pensons que découvrir des destinations d’exception doit être simple, inspirant et fiable.',
            'Notre mission est de relier les voyageurs aux hôtels, maisons d’hôtes, restaurants, sites et expériences qui font la singularité du Liban, grâce à une plateforme fondée sur la qualité et la transparence.',
          ],
          es: [
            '> Descubre el Líbano a través de lugares cuidadosamente seleccionados, información fiable y experiencias auténticas.',
            'En Vardenia creemos que descubrir destinos excepcionales debe ser sencillo, inspirador y fiable.',
            'Nuestra misión es conectar a los viajeros con los hoteles, casas de huéspedes, restaurantes, atracciones y experiencias que distinguen al Líbano, a través de una plataforma basada en la calidad y la transparencia.',
          ],
          pt: [
            '> Descubra o Líbano através de lugares escolhidos com cuidado, informação fiável e experiências autênticas.',
            'Na Vardenia acreditamos que descobrir destinos excecionais deve ser simples, inspirador e fiável.',
            'A nossa missão é ligar os viajantes aos hotéis, casas de hóspedes, restaurantes, atrações e experiências que distinguem o Líbano, através de uma plataforma assente na qualidade e na transparência.',
          ],
          ru: [
            '> Откройте Ливан через тщательно отобранные места, надёжную информацию и подлинные впечатления.',
            'В Vardenia мы считаем, что открывать исключительные места должно быть легко, вдохновляюще и надёжно.',
            'Наша миссия: связать путешественников с особенными отелями, гостевыми домами, ресторанами, достопримечательностями и впечатлениями Ливана через платформу, построенную на качестве и прозрачности.',
          ],
          zh: [
            '> 通过精心挑选的地方、可靠的信息和真实的体验，发现黎巴嫩。',
            '在 Vardenia，我们相信发现非凡的目的地应当轻松、令人向往且值得信赖。',
            '我们的使命是通过一个以品质和透明为基础的平台，把旅行者与黎巴嫩别具特色的酒店、民宿、餐厅、景点和体验联系起来。',
          ],
          hi: [
            '> ध्यान से चुनी गई जगहों, भरोसेमंद जानकारी और सच्चे अनुभवों के ज़रिए लेबनान को खोजें।',
            'Vardenia में हमारा मानना है कि असाधारण जगहों को खोजना आसान, प्रेरक और भरोसेमंद होना चाहिए।',
            'हमारा मिशन यात्रियों को लेबनान के विशिष्ट होटलों, गेस्टहाउसों, रेस्तराँओं, दर्शनीय स्थलों और अनुभवों से एक ऐसे प्लेटफ़ॉर्म के ज़रिए जोड़ना है जो गुणवत्ता और पारदर्शिता पर टिका है।',
          ],
          bn: [
            '> যত্নে বাছাই করা জায়গা, নির্ভরযোগ্য তথ্য আর খাঁটি অভিজ্ঞতার মধ্য দিয়ে লেবানন আবিষ্কার করুন।',
            'Vardenia-তে আমরা বিশ্বাস করি, অসাধারণ গন্তব্য আবিষ্কার হওয়া উচিত সহজ, অনুপ্রেরণাদায়ক ও নির্ভরযোগ্য।',
            'আমাদের লক্ষ্য হলো মান ও স্বচ্ছতার ওপর গড়া একটি প্ল্যাটফর্মের মাধ্যমে ভ্রমণকারীদের লেবাননের স্বতন্ত্র হোটেল, গেস্টহাউস, রেস্তোরাঁ, দর্শনীয় স্থান ও অভিজ্ঞতার সঙ্গে যুক্ত করা।',
          ],
          ur: [
            '> احتیاط سے منتخب جگہوں، قابلِ اعتماد معلومات اور حقیقی تجربات کے ذریعے لبنان کو دریافت کریں۔',
            'Vardenia میں ہمارا یقین ہے کہ غیر معمولی منزلوں کی دریافت آسان، متاثر کن اور قابلِ اعتماد ہونی چاہیے۔',
            'ہمارا مشن مسافروں کو لبنان کے منفرد ہوٹلوں، گیسٹ ہاؤسز، ریستورانوں، دلچسپ مقامات اور تجربات سے ایک ایسے پلیٹ فارم کے ذریعے جوڑنا ہے جو معیار اور شفافیت پر قائم ہے۔',
          ],
        }),
        subsections: [
          {
            heading: pick(locale, {
              en: 'Our Commitment',
              ar: 'التزامنا',
              fr: 'Notre engagement',
              es: 'Nuestro compromiso',
              pt: 'O nosso compromisso',
              ru: 'Наши обязательства',
              zh: '我们的承诺',
              hi: 'हमारी प्रतिबद्धता',
              bn: 'আমাদের অঙ্গীকার',
              ur: 'ہمارا عہد',
            }),
            body: pick(locale, {
              en: [
                '- **Carefully Selected Listings:** We focus on presenting relevant businesses and destinations that reflect the diversity and character of Lebanon.',
                '- **Reliable Information:** Our team manages listing content and coordinates updates to help visitors access useful and accurate details.',
                '- **Direct Connections:** Travelers can discover businesses, explore their offerings, and connect with service providers through available contact and booking options.',
                '- **Transparent Partnerships:** We aim to provide meaningful visibility for our partners while helping visitors make informed decisions.',
                '> Our goal is simple: to make discovering Lebanon more inspiring, accessible, and trustworthy.',
              ],
              ar: [
                '- **أماكن مختارة بعناية:** نركّز على تقديم أعمال ووجهات ذات صلة تعكس تنوّع لبنان وطابعه.',
                '- **معلومات موثوقة:** يدير فريقنا محتوى الصفحات وينسّق تحديثها ليصل الزوّار إلى تفاصيل مفيدة ودقيقة.',
                '- **تواصل مباشر:** يكتشف المسافرون الأعمال ويستكشفون ما تقدّمه، ويتواصلون مع مقدّمي الخدمات عبر وسائل الاتصال والحجز المتاحة.',
                '- **شراكات شفّافة:** نسعى إلى منح شركائنا حضوراً ذا معنى، ومساعدة الزوّار على اتّخاذ قرارات مدروسة.',
                '> هدفنا بسيط: أن نجعل اكتشاف لبنان أكثر إلهاماً وسهولة وثقة.',
              ],
              fr: [
                '- **Des fiches choisies avec soin :** nous présentons des établissements et des lieux pertinents, qui reflètent la diversité et le caractère du Liban.',
                '- **Des informations fiables :** notre équipe gère le contenu des fiches et coordonne leurs mises à jour, pour que les visiteurs trouvent des détails utiles et exacts.',
                '- **Des liens directs :** les voyageurs découvrent les établissements, explorent leur offre et contactent les prestataires grâce aux moyens de contact et de réservation disponibles.',
                '- **Des partenariats transparents :** nous voulons offrir à nos partenaires une visibilité qui compte, tout en aidant les visiteurs à choisir en connaissance de cause.',
                '> Notre objectif est simple : rendre la découverte du Liban plus inspirante, plus accessible et plus digne de confiance.',
              ],
              es: [
                '- **Fichas cuidadosamente seleccionadas:** presentamos negocios y destinos relevantes que reflejan la diversidad y el carácter del Líbano.',
                '- **Información fiable:** nuestro equipo gestiona el contenido de las fichas y coordina sus actualizaciones para que los visitantes encuentren datos útiles y precisos.',
                '- **Contacto directo:** los viajeros descubren los negocios, exploran lo que ofrecen y contactan con los proveedores mediante las opciones de contacto y reserva disponibles.',
                '- **Colaboraciones transparentes:** queremos dar a nuestros socios una visibilidad que cuente y ayudar a los visitantes a decidir con conocimiento.',
                '> Nuestro objetivo es sencillo: que descubrir el Líbano sea más inspirador, accesible y fiable.',
              ],
              pt: [
                '- **Fichas escolhidas com cuidado:** apresentamos negócios e destinos relevantes que refletem a diversidade e o carácter do Líbano.',
                '- **Informação fiável:** a nossa equipa gere o conteúdo das fichas e coordena as atualizações, para que os visitantes encontrem detalhes úteis e exatos.',
                '- **Ligação direta:** os viajantes descobrem os negócios, exploram o que oferecem e contactam os prestadores através das opções de contacto e reserva disponíveis.',
                '- **Parcerias transparentes:** queremos dar aos nossos parceiros uma visibilidade que conta e ajudar os visitantes a decidir de forma informada.',
                '> O nosso objetivo é simples: tornar a descoberta do Líbano mais inspiradora, acessível e digna de confiança.',
              ],
              ru: [
                '- **Тщательно отобранные карточки:** мы показываем значимые заведения и места, отражающие разнообразие и характер Ливана.',
                '- **Надёжная информация:** наша команда ведёт содержание карточек и согласует обновления, чтобы гости получали полезные и точные сведения.',
                '- **Прямая связь:** путешественники находят заведения, знакомятся с их предложениями и связываются с ними через доступные способы связи и бронирования.',
                '- **Прозрачное партнёрство:** мы стремимся дать партнёрам заметность, которая имеет значение, и помочь гостям принимать взвешенные решения.',
                '> Наша цель проста: сделать знакомство с Ливаном более вдохновляющим, доступным и надёжным.',
              ],
              zh: [
                '- **精心挑选的商户：** 我们专注于呈现能体现黎巴嫩多元与特色的相关商家和目的地。',
                '- **可靠的信息：** 我们的团队管理商户内容并协调更新，让访客获得实用、准确的信息。',
                '- **直接联系：** 旅行者可以发现商家、了解其服务，并通过现有的联系和预订方式与服务提供者取得联系。',
                '- **透明的合作：** 我们致力于为合作伙伴带来有意义的曝光，同时帮助访客做出明智的选择。',
                '> 我们的目标很简单：让发现黎巴嫩变得更令人向往、更容易，也更值得信赖。',
              ],
              hi: [
                '- **ध्यान से चुनी गई लिस्टिंग:** हम ऐसे प्रासंगिक व्यवसाय और जगहें सामने रखते हैं जो लेबनान की विविधता और चरित्र को दर्शाती हैं।',
                '- **भरोसेमंद जानकारी:** हमारी टीम लिस्टिंग की सामग्री संभालती है और अपडेट का समन्वय करती है, ताकि मेहमानों को उपयोगी और सही जानकारी मिले।',
                '- **सीधा संपर्क:** यात्री व्यवसायों को खोज सकते हैं, उनकी पेशकशें देख सकते हैं और उपलब्ध संपर्क व बुकिंग विकल्पों से सेवा देने वालों से जुड़ सकते हैं।',
                '- **पारदर्शी साझेदारी:** हम अपने साझेदारों को सार्थक पहचान देना चाहते हैं, और साथ ही मेहमानों को सोच-समझकर फ़ैसले लेने में मदद करना।',
                '> हमारा लक्ष्य सीधा है: लेबनान की खोज को और प्रेरक, सुलभ और भरोसेमंद बनाना।',
              ],
              bn: [
                '- **যত্নে বাছাই করা লিস্টিং:** আমরা এমন প্রাসঙ্গিক ব্যবসা ও গন্তব্য তুলে ধরি যা লেবাননের বৈচিত্র্য ও চরিত্রকে প্রতিফলিত করে।',
                '- **নির্ভরযোগ্য তথ্য:** আমাদের দল লিস্টিংয়ের কনটেন্ট পরিচালনা করে ও হালনাগাদ সমন্বয় করে, যাতে অতিথিরা কাজের ও সঠিক তথ্য পান।',
                '- **সরাসরি যোগাযোগ:** ভ্রমণকারীরা ব্যবসা খুঁজে পান, তাদের সেবা ঘুরে দেখেন এবং উপলব্ধ যোগাযোগ ও বুকিংয়ের উপায়ে সেবাদাতাদের সঙ্গে যুক্ত হন।',
                '- **স্বচ্ছ অংশীদারি:** আমরা অংশীদারদের অর্থপূর্ণ পরিচিতি দিতে চাই, আর অতিথিদের জেনে-বুঝে সিদ্ধান্ত নিতে সাহায্য করতে চাই।',
                '> আমাদের লক্ষ্য সহজ: লেবানন আবিষ্কারকে আরও অনুপ্রেরণাদায়ক, সহজলভ্য ও নির্ভরযোগ্য করা।',
              ],
              ur: [
                '- **احتیاط سے منتخب لسٹنگز:** ہم ایسے متعلقہ کاروبار اور منزلیں پیش کرتے ہیں جو لبنان کے تنوع اور مزاج کی عکاسی کرتی ہیں۔',
                '- **قابلِ اعتماد معلومات:** ہماری ٹیم لسٹنگ کا مواد سنبھالتی اور اپ ڈیٹس کو مربوط کرتی ہے، تاکہ مہمانوں کو مفید اور درست تفصیلات ملیں۔',
                '- **براہِ راست رابطہ:** مسافر کاروبار دریافت کر سکتے ہیں، ان کی پیشکشیں دیکھ سکتے ہیں اور دستیاب رابطے اور بکنگ کے ذرائع سے خدمات فراہم کرنے والوں سے جڑ سکتے ہیں۔',
                '- **شفاف شراکت داری:** ہم اپنے شراکت داروں کو بامعنی پہچان دینا چاہتے ہیں، اور ساتھ ہی مہمانوں کو سوچ سمجھ کر فیصلے کرنے میں مدد دینا۔',
                '> ہمارا مقصد سادہ ہے: لبنان کی دریافت کو زیادہ متاثر کن، آسان اور قابلِ اعتماد بنانا۔',
              ],
            }),
          },
        ],
      },
      {
        heading: pick(locale, {
          en: 'The Vardenia Story',
          ar: 'قصّة فاردينيا',
          fr: 'L’histoire de Vardenia',
          es: 'La historia de Vardenia',
          pt: 'A história da Vardenia',
          ru: 'История Vardenia',
          zh: 'Vardenia 的故事',
          hi: 'Vardenia की कहानी',
          bn: 'Vardenia-র গল্প',
          ur: 'Vardenia کی کہانی',
        }),
        /**
         * The owner's text of 11 November 2026, replacing "Who we are" (the
         * address). "> " is a pull quote and "~ " the closing signature
         * (ContentPage).
         */
        body: pick(locale, {
          en: [
            '> One Country. Countless Stories. Endless Discoveries.',
            'Lebanon is a land of extraordinary contrasts, where ancient heritage meets modern life, mountains overlook the Mediterranean, and every destination tells a story of its own.',
            '> Vardenia was born from a belief that Lebanon deserves to be discovered, celebrated, and experienced in all its richness.',
            'More than a tourism magazine, Vardenia is a curated travel and discovery platform dedicated to showcasing the very essence of Lebanon.',
            'Through our printed publication and digital platform, we bring together distinctive destinations, exceptional hospitality, authentic cuisine, cultural treasures, and unique experiences from across the country.',
            'From hidden gems to celebrated landmarks, our purpose is to inspire exploration, connect travelers with local businesses, and reveal the remarkable diversity that makes Lebanon truly unforgettable.',
          ],
          ar: [
            '> بلد واحد. قصص لا تُحصى. اكتشافات بلا نهاية.',
            'لبنان أرض تناقضات استثنائية، يلتقي فيها التراث العريق بالحياة الحديثة، وتطلّ جباله على المتوسط، ولكلّ وجهة فيه قصّتها الخاصّة.',
            '> وُلدت فاردينيا من إيمان بأن لبنان يستحقّ أن يُكتشَف ويُحتفى به ويُعاش بكلّ غناه.',
            'فاردينيا أكثر من مجلة سياحية: إنها منصّة مختارة للسفر والاكتشاف، مكرّسة لإظهار جوهر لبنان.',
            'عبر مطبوعتنا ومنصّتنا الرقمية، نجمع وجهات مميّزة وضيافة استثنائية ومطبخاً أصيلاً وكنوزاً ثقافية وتجارب فريدة من أنحاء البلد كافّة.',
            'من الكنوز المخفية إلى المعالم الشهيرة، غايتنا أن نُلهم الاستكشاف، وأن نصل المسافرين بالأعمال المحلية، وأن نكشف التنوّع المدهش الذي يجعل لبنان لا يُنسى.',
          ],
          fr: [
            '> Un pays. D’innombrables histoires. Des découvertes sans fin.',
            'Le Liban est une terre de contrastes extraordinaires, où le patrimoine ancien rencontre la vie moderne, où les montagnes dominent la Méditerranée et où chaque lieu raconte sa propre histoire.',
            '> Vardenia est née de la conviction que le Liban mérite d’être découvert, célébré et vécu dans toute sa richesse.',
            'Plus qu’un magazine de tourisme, Vardenia est une plateforme de voyage et de découverte, fondée sur la sélection et consacrée à l’essence même du Liban.',
            'À travers notre magazine imprimé et notre plateforme numérique, nous réunissons des destinations singulières, une hospitalité d’exception, une cuisine authentique, des trésors culturels et des expériences uniques venues de tout le pays.',
            'Des trésors cachés aux sites célèbres, notre but est de donner envie d’explorer, de relier les voyageurs aux établissements locaux et de révéler la remarquable diversité qui rend le Liban inoubliable.',
          ],
          es: [
            '> Un país. Incontables historias. Descubrimientos sin fin.',
            'El Líbano es una tierra de contrastes extraordinarios, donde el patrimonio antiguo se encuentra con la vida moderna, las montañas miran al Mediterráneo y cada destino cuenta su propia historia.',
            '> Vardenia nació de la convicción de que el Líbano merece ser descubierto, celebrado y vivido en toda su riqueza.',
            'Más que una revista de turismo, Vardenia es una plataforma de viajes y descubrimiento, construida con criterio y dedicada a mostrar la esencia misma del Líbano.',
            'A través de nuestra publicación impresa y nuestra plataforma digital, reunimos destinos singulares, una hospitalidad excepcional, cocina auténtica, tesoros culturales y experiencias únicas de todo el país.',
            'De las joyas escondidas a los lugares más célebres, nuestro propósito es inspirar a explorar, conectar a los viajeros con los negocios locales y revelar la extraordinaria diversidad que hace del Líbano un lugar inolvidable.',
          ],
          pt: [
            '> Um país. Histórias sem conta. Descobertas sem fim.',
            'O Líbano é uma terra de contrastes extraordinários, onde o património antigo encontra a vida moderna, as montanhas olham o Mediterrâneo e cada destino conta a sua própria história.',
            '> A Vardenia nasceu da convicção de que o Líbano merece ser descoberto, celebrado e vivido em toda a sua riqueza.',
            'Mais do que uma revista de turismo, a Vardenia é uma plataforma de viagem e descoberta, feita com curadoria e dedicada a mostrar a essência do Líbano.',
            'Através da nossa publicação impressa e da nossa plataforma digital, reunimos destinos singulares, hospitalidade excecional, cozinha autêntica, tesouros culturais e experiências únicas de todo o país.',
            'Dos tesouros escondidos aos lugares mais célebres, o nosso propósito é inspirar a explorar, ligar os viajantes aos negócios locais e revelar a notável diversidade que torna o Líbano inesquecível.',
          ],
          ru: [
            '> Одна страна. Бесчисленные истории. Бесконечные открытия.',
            'Ливан: земля удивительных контрастов, где древнее наследие встречается с современной жизнью, горы смотрят на Средиземное море, а у каждого места своя история.',
            '> Vardenia родилась из убеждения, что Ливан заслуживает того, чтобы его открывали, прославляли и проживали во всём его богатстве.',
            'Vardenia больше, чем туристический журнал: это платформа для путешествий и открытий, основанная на отборе и посвящённая самой сути Ливана.',
            'В печатном издании и на цифровой платформе мы собираем особенные места, исключительное гостеприимство, подлинную кухню, культурные сокровища и неповторимые впечатления со всей страны.',
            'От скрытых жемчужин до знаменитых достопримечательностей: наша цель: вдохновлять на путешествия, связывать гостей с местным бизнесом и открывать удивительное разнообразие, которое делает Ливан незабываемым.',
          ],
          zh: [
            '> 一个国家，无数故事，无尽发现。',
            '黎巴嫩是一片充满非凡反差的土地：古老的遗产与现代生活交汇，群山俯瞰地中海，每一个目的地都有属于自己的故事。',
            '> Vardenia 源于一个信念：黎巴嫩值得以它的全部丰富被发现、被赞美、被亲身体验。',
            'Vardenia 不只是一本旅游杂志，更是一个精选的旅行与发现平台，致力于展现黎巴嫩最本真的模样。',
            '通过我们的印刷刊物和数字平台，我们汇集了来自全国各地的独特目的地、非凡的款待、地道的美食、文化瑰宝和独一无二的体验。',
            '从鲜为人知的宝藏到声名远扬的地标，我们的目标是激发探索、把旅行者与本地商家联系起来，并展现让黎巴嫩令人难忘的非凡多样。',
          ],
          hi: [
            '> एक देश। अनगिनत कहानियाँ। अंतहीन खोजें।',
            'लेबनान असाधारण विरोधाभासों की धरती है, जहाँ प्राचीन विरासत आधुनिक जीवन से मिलती है, पहाड़ भूमध्य सागर को निहारते हैं और हर जगह की अपनी एक कहानी है।',
            '> Vardenia इस विश्वास से जन्मी कि लेबनान को उसकी पूरी समृद्धि के साथ खोजा, सराहा और जिया जाना चाहिए।',
            'एक पर्यटन पत्रिका से बढ़कर, Vardenia यात्रा और खोज का एक चुनिंदा प्लेटफ़ॉर्म है, जो लेबनान के असली सार को सामने लाने के लिए समर्पित है।',
            'अपनी छपी हुई पत्रिका और डिजिटल प्लेटफ़ॉर्म के ज़रिए हम पूरे देश से विशिष्ट जगहें, असाधारण आतिथ्य, असली व्यंजन, सांस्कृतिक धरोहरें और अनोखे अनुभव एक साथ लाते हैं।',
            'छिपे हुए रत्नों से लेकर प्रसिद्ध स्थलों तक, हमारा उद्देश्य खोज की प्रेरणा देना, यात्रियों को स्थानीय व्यवसायों से जोड़ना और उस अद्भुत विविधता को सामने लाना है जो लेबनान को सचमुच अविस्मरणीय बनाती है।',
          ],
          bn: [
            '> একটি দেশ। অগণিত গল্প। অফুরান আবিষ্কার।',
            'লেবানন অসাধারণ বৈপরীত্যের দেশ, যেখানে প্রাচীন ঐতিহ্য মেলে আধুনিক জীবনের সঙ্গে, পাহাড় তাকিয়ে থাকে ভূমধ্যসাগরের দিকে, আর প্রতিটি গন্তব্যের রয়েছে নিজস্ব গল্প।',
            '> Vardenia-র জন্ম এই বিশ্বাস থেকে যে লেবানন তার সমস্ত ঐশ্বর্য নিয়ে আবিষ্কৃত, উদযাপিত ও অনুভূত হওয়ার যোগ্য।',
            'একটি পর্যটন ম্যাগাজিনের চেয়েও বেশি, Vardenia ভ্রমণ ও আবিষ্কারের একটি বাছাই করা প্ল্যাটফর্ম, যা লেবাননের আসল সারকে তুলে ধরতে নিবেদিত।',
            'আমাদের ছাপা প্রকাশনা ও ডিজিটাল প্ল্যাটফর্মের মাধ্যমে আমরা সারা দেশ থেকে স্বতন্ত্র গন্তব্য, অসাধারণ আতিথেয়তা, খাঁটি রান্না, সাংস্কৃতিক সম্পদ ও অনন্য অভিজ্ঞতা একত্র করি।',
            'লুকানো রত্ন থেকে বিখ্যাত নিদর্শন পর্যন্ত, আমাদের উদ্দেশ্য অন্বেষণে অনুপ্রাণিত করা, ভ্রমণকারীদের স্থানীয় ব্যবসার সঙ্গে যুক্ত করা এবং সেই অসাধারণ বৈচিত্র্য তুলে ধরা যা লেবাননকে সত্যিই অবিস্মরণীয় করে।',
          ],
          ur: [
            '> ایک ملک۔ ان گنت کہانیاں۔ لامتناہی دریافتیں۔',
            'لبنان غیر معمولی تضادات کی سرزمین ہے، جہاں قدیم ورثہ جدید زندگی سے ملتا ہے، پہاڑ بحیرۂ روم پر نظر رکھتے ہیں اور ہر منزل کی اپنی کہانی ہے۔',
            '> Vardenia اس یقین سے پیدا ہوا کہ لبنان اپنی پوری رونق کے ساتھ دریافت کیے جانے، سراہے جانے اور جیے جانے کا حق دار ہے۔',
            'سیاحتی میگزین سے بڑھ کر، Vardenia سفر اور دریافت کا ایک منتخب پلیٹ فارم ہے جو لبنان کی اصل روح کو سامنے لانے کے لیے وقف ہے۔',
            'اپنی چھپی ہوئی اشاعت اور ڈیجیٹل پلیٹ فارم کے ذریعے ہم پورے ملک سے منفرد منزلیں، غیر معمولی مہمان نوازی، اصلی کھانے، ثقافتی خزانے اور انوکھے تجربات یکجا کرتے ہیں۔',
            'پوشیدہ نگینوں سے مشہور مقامات تک، ہمارا مقصد دریافت کی ترغیب دینا، مسافروں کو مقامی کاروباروں سے جوڑنا اور اس حیرت انگیز تنوع کو سامنے لانا ہے جو لبنان کو واقعی ناقابلِ فراموش بناتا ہے۔',
          ],
        }),
        subsections: [
          {
            heading: pick(locale, {
              en: 'Our Vision',
              ar: 'رؤيتنا',
              fr: 'Notre vision',
              es: 'Nuestra visión',
              pt: 'A nossa visão',
              ru: 'Наше видение',
              zh: '我们的愿景',
              hi: 'हमारी दृष्टि',
              bn: 'আমাদের দৃষ্টি',
              ur: 'ہمارا وژن',
            }),
            body: pick(locale, {
              en: [
                '> To become a leading gateway to discovering Lebanon.',
                "We envision Vardenia as a trusted and inspiring reference for travelers seeking to explore Lebanon's destinations, culture, hospitality, and experiences.",
                "Our ambition is to contribute to Lebanon's recognition as an exceptional tourism destination while supporting a thriving, connected, and sustainable tourism industry.",
                "We aspire to create a platform where every region is represented, every authentic experience has the opportunity to be discovered, and Lebanon's unique identity is shared with the world.",
              ],
              ar: [
                '> أن نصبح بوّابة رائدة لاكتشاف لبنان.',
                'نرى فاردينيا مرجعاً موثوقاً وملهماً للمسافرين الراغبين في استكشاف وجهات لبنان وثقافته وضيافته وتجاربه.',
                'طموحنا أن نساهم في ترسيخ مكانة لبنان وجهةً سياحية استثنائية، وأن ندعم قطاعاً سياحياً مزدهراً ومترابطاً ومستداماً.',
                'نتطلّع إلى منصّة تُمثَّل فيها كلّ منطقة، وتُتاح فيها لكلّ تجربة أصيلة فرصة أن تُكتشف، وتُشارَك فيها هويّة لبنان الفريدة مع العالم.',
              ],
              fr: [
                '> Devenir une porte d’entrée de référence pour découvrir le Liban.',
                'Nous voyons Vardenia comme une référence fiable et inspirante pour les voyageurs qui souhaitent explorer les destinations, la culture, l’hospitalité et les expériences du Liban.',
                'Notre ambition est de contribuer à faire reconnaître le Liban comme une destination touristique d’exception, tout en soutenant un secteur du tourisme prospère, connecté et durable.',
                'Nous voulons créer une plateforme où chaque région est représentée, où chaque expérience authentique a la chance d’être découverte et où l’identité unique du Liban est partagée avec le monde.',
              ],
              es: [
                '> Convertirnos en una puerta de entrada de referencia para descubrir el Líbano.',
                'Imaginamos Vardenia como una referencia fiable e inspiradora para los viajeros que quieren explorar los destinos, la cultura, la hospitalidad y las experiencias del Líbano.',
                'Nuestra ambición es contribuir a que el Líbano sea reconocido como un destino turístico excepcional, apoyando a la vez un sector turístico próspero, conectado y sostenible.',
                'Aspiramos a crear una plataforma donde cada región esté representada, cada experiencia auténtica tenga la oportunidad de ser descubierta y la identidad única del Líbano se comparta con el mundo.',
              ],
              pt: [
                '> Tornarmo-nos uma porta de entrada de referência para descobrir o Líbano.',
                'Imaginamos a Vardenia como uma referência fiável e inspiradora para os viajantes que querem explorar os destinos, a cultura, a hospitalidade e as experiências do Líbano.',
                'A nossa ambição é contribuir para que o Líbano seja reconhecido como um destino turístico excecional, apoiando um setor do turismo próspero, ligado e sustentável.',
                'Queremos criar uma plataforma onde cada região esteja representada, cada experiência autêntica tenha a oportunidade de ser descoberta e a identidade única do Líbano seja partilhada com o mundo.',
              ],
              ru: [
                '> Стать ведущими воротами в Ливан.',
                'Мы видим Vardenia надёжным и вдохновляющим источником для путешественников, которые хотят узнать места, культуру, гостеприимство и впечатления Ливана.',
                'Мы стремимся помочь Ливану получить признание как исключительному туристическому направлению и поддержать процветающую, связанную и устойчивую туристическую отрасль.',
                'Мы хотим создать платформу, где представлен каждый регион, у каждого подлинного впечатления есть шанс быть замеченным, а неповторимый облик Ливана становится известен всему миру.',
              ],
              zh: [
                '> 成为发现黎巴嫩的首要门户。',
                '我们希望 Vardenia 成为旅行者探索黎巴嫩目的地、文化、款待与体验时值得信赖、富有启发的参考。',
                '我们的抱负是助力黎巴嫩被公认为卓越的旅游目的地，同时支持一个繁荣、互联且可持续的旅游业。',
                '我们希望打造这样一个平台：每个地区都有一席之地，每一种真实的体验都有机会被发现，黎巴嫩独特的身份得以与世界分享。',
              ],
              hi: [
                '> लेबनान की खोज का एक अग्रणी द्वार बनना।',
                'हम Vardenia को उन यात्रियों के लिए एक भरोसेमंद और प्रेरक संदर्भ के रूप में देखते हैं जो लेबनान की जगहों, संस्कृति, आतिथ्य और अनुभवों को खोजना चाहते हैं।',
                'हमारी आकांक्षा है कि लेबनान को एक असाधारण पर्यटन स्थल के रूप में पहचान दिलाने में योगदान दें, और साथ ही एक फलते-फूलते, जुड़े हुए और टिकाऊ पर्यटन उद्योग का साथ दें।',
                'हम ऐसा प्लेटफ़ॉर्म बनाना चाहते हैं जहाँ हर क्षेत्र का प्रतिनिधित्व हो, हर सच्चे अनुभव को खोजे जाने का मौक़ा मिले और लेबनान की अनूठी पहचान दुनिया तक पहुँचे।',
              ],
              bn: [
                '> লেবানন আবিষ্কারের এক অগ্রণী প্রবেশদ্বার হয়ে ওঠা।',
                'আমরা Vardenia-কে দেখি সেই ভ্রমণকারীদের জন্য একটি নির্ভরযোগ্য ও অনুপ্রেরণাদায়ক সূত্র হিসেবে, যাঁরা লেবাননের গন্তব্য, সংস্কৃতি, আতিথেয়তা ও অভিজ্ঞতা ঘুরে দেখতে চান।',
                'আমাদের আকাঙ্ক্ষা লেবাননকে একটি অসাধারণ পর্যটন গন্তব্য হিসেবে স্বীকৃতি পেতে সাহায্য করা, আর একটি সমৃদ্ধ, সংযুক্ত ও টেকসই পর্যটন শিল্পের পাশে থাকা।',
                'আমরা এমন একটি প্ল্যাটফর্ম গড়তে চাই যেখানে প্রতিটি অঞ্চলের প্রতিনিধিত্ব থাকবে, প্রতিটি খাঁটি অভিজ্ঞতা আবিষ্কৃত হওয়ার সুযোগ পাবে, আর লেবাননের অনন্য পরিচয় পৌঁছে যাবে বিশ্বের কাছে।',
              ],
              ur: [
                '> لبنان کی دریافت کا ایک نمایاں دروازہ بننا۔',
                'ہم Vardenia کو اُن مسافروں کے لیے ایک قابلِ اعتماد اور متاثر کن حوالہ دیکھتے ہیں جو لبنان کی منزلوں، ثقافت، مہمان نوازی اور تجربات کو دریافت کرنا چاہتے ہیں۔',
                'ہماری خواہش ہے کہ لبنان کو ایک غیر معمولی سیاحتی منزل کے طور پر پہچان دلانے میں حصہ ڈالیں، اور ساتھ ہی ایک پھلتی پھولتی، مربوط اور پائیدار سیاحتی صنعت کا ساتھ دیں۔',
                'ہم ایسا پلیٹ فارم بنانا چاہتے ہیں جہاں ہر علاقے کی نمائندگی ہو، ہر حقیقی تجربے کو دریافت ہونے کا موقع ملے اور لبنان کی منفرد شناخت دنیا تک پہنچے۔',
              ],
            }),
          },
          {
            heading: pick(locale, {
              en: 'Our Mission',
              ar: 'مهمّتنا',
              fr: 'Notre mission',
              es: 'Nuestra misión',
              pt: 'A nossa missão',
              ru: 'Наша миссия',
              zh: '我们的使命',
              hi: 'हमारा मिशन',
              bn: 'আমাদের লক্ষ্য',
              ur: 'ہمارا مشن',
            }),
            body: pick(locale, {
              en: [
                '> Connecting People. Celebrating Places. Inspiring Journeys.',
                'Our mission is to showcase the best of Lebanon through carefully curated content, engaging storytelling, and innovative digital experiences.',
                'By connecting travelers with hotels, guesthouses, restaurants, attractions, and local businesses, we aim to make discovering Lebanon more accessible, meaningful, and enjoyable.',
                "We are committed to supporting Lebanon's tourism community by promoting local businesses, encouraging exploration beyond traditional destinations, and creating valuable opportunities for visibility and growth.",
                "> At Vardenia, we don't simply introduce destinations. We inspire people to experience the stories, culture, and spirit behind them.",
                '~ All Lebanon. One Extraordinary Journey.',
              ],
              ar: [
                '> نصل الناس. نحتفي بالأماكن. نُلهم الرحلات.',
                'مهمّتنا أن نُظهر أفضل ما في لبنان عبر محتوى مختار بعناية، وسرد قصصي جذّاب، وتجارب رقمية مبتكرة.',
                'بوصل المسافرين بالفنادق وبيوت الضيافة والمطاعم والمعالم والأعمال المحلية، نسعى إلى أن نجعل اكتشاف لبنان أسهل وأعمق معنى وأكثر متعة.',
                'نلتزم بدعم المجتمع السياحي في لبنان، بالترويج للأعمال المحلية، وتشجيع الاستكشاف أبعد من الوجهات التقليدية، وخلق فرص قيّمة للحضور والنموّ.',
                '> في فاردينيا، لا نكتفي بالتعريف بالوجهات. نحن نُلهم الناس ليعيشوا القصص والثقافة والروح التي تقف وراءها.',
                '~ كلّ لبنان. رحلة واحدة استثنائية.',
              ],
              fr: [
                '> Relier les gens. Célébrer les lieux. Inspirer les voyages.',
                'Notre mission est de montrer le meilleur du Liban grâce à des contenus choisis avec soin, des récits qui captivent et des expériences numériques innovantes.',
                'En reliant les voyageurs aux hôtels, maisons d’hôtes, restaurants, sites et commerces locaux, nous voulons rendre la découverte du Liban plus accessible, plus riche de sens et plus agréable.',
                'Nous nous engageons à soutenir la communauté touristique libanaise en mettant en avant les établissements locaux, en encourageant l’exploration au-delà des destinations habituelles et en créant de vraies occasions de visibilité et de croissance.',
                '> Chez Vardenia, nous ne nous contentons pas de présenter des destinations. Nous donnons envie de vivre les histoires, la culture et l’esprit qui les habitent.',
                '~ Tout le Liban. Un voyage extraordinaire.',
              ],
              es: [
                '> Conectar personas. Celebrar lugares. Inspirar viajes.',
                'Nuestra misión es mostrar lo mejor del Líbano a través de contenidos cuidadosamente seleccionados, relatos que atrapan y experiencias digitales innovadoras.',
                'Al conectar a los viajeros con hoteles, casas de huéspedes, restaurantes, atracciones y negocios locales, queremos que descubrir el Líbano sea más accesible, significativo y agradable.',
                'Nos comprometemos a apoyar a la comunidad turística del Líbano promoviendo los negocios locales, animando a explorar más allá de los destinos tradicionales y creando oportunidades valiosas de visibilidad y crecimiento.',
                '> En Vardenia no nos limitamos a presentar destinos. Inspiramos a las personas a vivir las historias, la cultura y el espíritu que hay detrás de ellos.',
                '~ Todo el Líbano. Un viaje extraordinario.',
              ],
              pt: [
                '> Ligar pessoas. Celebrar lugares. Inspirar viagens.',
                'A nossa missão é mostrar o melhor do Líbano através de conteúdos escolhidos com cuidado, histórias envolventes e experiências digitais inovadoras.',
                'Ao ligar os viajantes a hotéis, casas de hóspedes, restaurantes, atrações e negócios locais, queremos tornar a descoberta do Líbano mais acessível, significativa e agradável.',
                'Comprometemo-nos a apoiar a comunidade turística do Líbano, promovendo os negócios locais, incentivando a exploração para lá dos destinos habituais e criando oportunidades valiosas de visibilidade e crescimento.',
                '> Na Vardenia não nos limitamos a apresentar destinos. Inspiramos as pessoas a viver as histórias, a cultura e o espírito que estão por trás deles.',
                '~ Todo o Líbano. Uma viagem extraordinária.',
              ],
              ru: [
                '> Соединять людей. Прославлять места. Вдохновлять на путешествия.',
                'Наша миссия: показывать лучшее в Ливане через тщательно отобранный контент, увлекательные истории и новые цифровые возможности.',
                'Связывая путешественников с отелями, гостевыми домами, ресторанами, достопримечательностями и местным бизнесом, мы хотим сделать знакомство с Ливаном доступнее, содержательнее и приятнее.',
                'Мы поддерживаем туристическое сообщество Ливана: продвигаем местный бизнес, зовём исследовать страну за пределами привычных маршрутов и создаём настоящие возможности для заметности и роста.',
                '> В Vardenia мы не просто рассказываем о местах. Мы вдохновляем людей прожить истории, культуру и дух, которые за ними стоят.',
                '~ Весь Ливан. Одно необыкновенное путешествие.',
              ],
              zh: [
                '> 连接人与人，礼赞每个地方，启发每段旅程。',
                '我们的使命是通过精心策划的内容、引人入胜的故事和创新的数字体验，展现黎巴嫩最好的一面。',
                '通过把旅行者与酒店、民宿、餐厅、景点和本地商家联系起来，我们希望让发现黎巴嫩变得更容易、更有意义，也更愉快。',
                '我们致力于支持黎巴嫩的旅游群体：推广本地商家，鼓励人们走出传统路线去探索，并为曝光与成长创造有价值的机会。',
                '> 在 Vardenia，我们不只是介绍目的地，更启发人们去体验其背后的故事、文化与精神。',
                '~ 整个黎巴嫩，一段非凡的旅程。',
              ],
              hi: [
                '> लोगों को जोड़ना। जगहों का उत्सव मनाना। यात्राओं को प्रेरित करना।',
                'हमारा मिशन ध्यान से चुनी गई सामग्री, दिलचस्प कहानियों और नए डिजिटल अनुभवों के ज़रिए लेबनान का सबसे अच्छा रूप दिखाना है।',
                'यात्रियों को होटलों, गेस्टहाउसों, रेस्तराँओं, दर्शनीय स्थलों और स्थानीय व्यवसायों से जोड़कर हम लेबनान की खोज को और सुलभ, सार्थक और आनंददायक बनाना चाहते हैं।',
                'हम लेबनान के पर्यटन समुदाय का साथ देने के लिए प्रतिबद्ध हैं: स्थानीय व्यवसायों को बढ़ावा देकर, पारंपरिक जगहों से आगे खोज के लिए प्रोत्साहित करके और पहचान व विकास के मूल्यवान अवसर बनाकर।',
                '> Vardenia में हम सिर्फ़ जगहों का परिचय नहीं कराते। हम लोगों को उनके पीछे की कहानियों, संस्कृति और आत्मा को जीने की प्रेरणा देते हैं।',
                '~ पूरा लेबनान। एक असाधारण यात्रा।',
              ],
              bn: [
                '> মানুষকে যুক্ত করা। জায়গাকে উদযাপন করা। যাত্রাকে অনুপ্রাণিত করা।',
                'আমাদের লক্ষ্য যত্নে বাছাই করা কনটেন্ট, আকর্ষণীয় গল্প আর উদ্ভাবনী ডিজিটাল অভিজ্ঞতার মধ্য দিয়ে লেবাননের সেরাটা তুলে ধরা।',
                'ভ্রমণকারীদের হোটেল, গেস্টহাউস, রেস্তোরাঁ, দর্শনীয় স্থান ও স্থানীয় ব্যবসার সঙ্গে যুক্ত করে আমরা লেবানন আবিষ্কারকে আরও সহজলভ্য, অর্থবহ ও আনন্দময় করতে চাই।',
                'আমরা লেবাননের পর্যটন সম্প্রদায়ের পাশে থাকতে অঙ্গীকারবদ্ধ: স্থানীয় ব্যবসার প্রচার করে, প্রচলিত গন্তব্যের বাইরে ঘুরে দেখতে উৎসাহ দিয়ে, আর পরিচিতি ও বৃদ্ধির মূল্যবান সুযোগ তৈরি করে।',
                '> Vardenia-তে আমরা শুধু গন্তব্যের পরিচয় দিই না। আমরা মানুষকে অনুপ্রাণিত করি তার পেছনের গল্প, সংস্কৃতি ও প্রাণকে অনুভব করতে।',
                '~ সমগ্র লেবানন। এক অসাধারণ যাত্রা।',
              ],
              ur: [
                '> لوگوں کو جوڑنا۔ جگہوں کا جشن منانا۔ سفر کی ترغیب دینا۔',
                'ہمارا مشن احتیاط سے منتخب مواد، دلچسپ کہانیوں اور نئے ڈیجیٹل تجربات کے ذریعے لبنان کا بہترین رخ دکھانا ہے۔',
                'مسافروں کو ہوٹلوں، گیسٹ ہاؤسز، ریستورانوں، دلچسپ مقامات اور مقامی کاروباروں سے جوڑ کر ہم لبنان کی دریافت کو زیادہ آسان، بامعنی اور خوشگوار بنانا چاہتے ہیں۔',
                'ہم لبنان کی سیاحتی برادری کا ساتھ دینے کے پابند ہیں: مقامی کاروباروں کو فروغ دے کر، روایتی منزلوں سے آگے دریافت کی حوصلہ افزائی کر کے، اور پہچان اور ترقی کے قیمتی مواقع پیدا کر کے۔',
                '> Vardenia میں ہم صرف منزلوں کا تعارف نہیں کراتے۔ ہم لوگوں کو ان کے پیچھے چھپی کہانیوں، ثقافت اور روح کو جینے کی ترغیب دیتے ہیں۔',
                '~ پورا لبنان۔ ایک غیر معمولی سفر۔',
              ],
            }),
          },
        ],
      },
    ],
  }
}

// ------------------------------------------------------------------- contact

export function contactPage(locale: Locale = 'en'): ContentPage {
  return {
    title: pick(locale, {
      en: 'Contact',
      ar: 'اتصل بنا',
      fr: 'Contact',
      es: 'Contacto',
      pt: 'Contato',
      ru: 'Контакты',
      zh: '联系我们',
      hi: 'संपर्क',
      bn: 'যোগাযোগ',
      ur: 'رابطہ',
    }),
    intro: pick(locale, {
      en: 'For anything about a booking, a listing, or the magazine. We read everything that comes in and answer in the order it arrives.',
      ar: 'لأي أمر يخص حجزاً أو مكاناً مدرجاً أو المجلة. نقرأ كل ما يصلنا ونجيب بالترتيب الذي يصل به.',
      fr: "Pour tout ce qui concerne une réservation, une fiche ou le magazine. Nous lisons tout ce qui arrive et répondons dans l'ordre d'arrivée.",
      es: 'Para cualquier cosa sobre una reserva, una ficha o la revista. Leemos todo lo que llega y respondemos por orden de llegada.',
      pt: 'Para qualquer assunto sobre uma reserva, uma ficha ou a revista. Lemos tudo o que chega e respondemos na ordem de chegada.',
      ru: 'По любым вопросам о бронировании, карточке заведения или журнале. Мы читаем всё, что приходит, и отвечаем в порядке очереди.',
      zh: '凡是关于预订、商户页面或杂志的事情，都可以联系我们。每一条来信我们都会阅读，并按收到的顺序回复。',
      hi: 'बुकिंग, किसी लिस्टिंग या पत्रिका से जुड़ी किसी भी बात के लिए। जो भी आता है हम सब पढ़ते हैं और जिस क्रम में आता है उसी क्रम में जवाब देते हैं।',
      bn: 'বুকিং, কোনো লিস্টিং বা ম্যাগাজিন নিয়ে যেকোনো বিষয়ে। যা কিছু আসে আমরা সবই পড়ি এবং যে ক্রমে আসে সেই ক্রমেই উত্তর দিই।',
      ur: 'بکنگ، کسی لسٹنگ یا میگزین سے متعلق کسی بھی بات کے لیے۔ جو کچھ آتا ہے ہم سب پڑھتے ہیں اور جس ترتیب سے آتا ہے اسی ترتیب سے جواب دیتے ہیں۔',
    }),
    sections: [
      {
        heading: pick(locale, {
          en: 'If it is about a booking',
          ar: 'إذا كان الأمر يخص حجزاً',
          fr: "S'il s'agit d'une réservation",
          es: 'Si se trata de una reserva',
          pt: 'Se for sobre uma reserva',
          ru: 'Если вопрос о бронировании',
          zh: '如果是关于预订',
          hi: 'अगर बात किसी बुकिंग की है',
          bn: 'যদি বুকিং নিয়ে হয়',
          ur: 'اگر بات کسی بکنگ کی ہے',
        }),
        body: pick(locale, {
          en: [
            'Quote the reference from your confirmation email. It looks like **5N9DA470** and it is the fastest way for us to find the reservation.',
            'A booking is held by the venue rather than by us.',
          ],
          ar: [
            'اذكر الرقم المرجعي الموجود في رسالة التأكيد. شكله مثل **5N9DA470**، وهو أسرع طريقة نجد بها الحجز.',
            'الحجز يحتفظ به المكان لا نحن.',
          ],
          fr: [
            "Indiquez la référence figurant dans votre e-mail de confirmation. Elle ressemble à **5N9DA470**, et c'est le moyen le plus rapide pour nous de retrouver la réservation.",
            "Une réservation est tenue par l'établissement et non par nous.",
          ],
          es: [
            'Indica la referencia de tu correo de confirmación. Tiene este aspecto: **5N9DA470**, y es la forma más rápida de que encontremos la reserva.',
            'La reserva la gestiona el local, no nosotros.',
          ],
          pt: [
            'Informe a referência do seu e-mail de confirmação. Ela se parece com **5N9DA470** e é o jeito mais rápido de encontrarmos a reserva.',
            'A reserva fica com o estabelecimento, não conosco.',
          ],
          ru: [
            'Укажите номер из письма с подтверждением. Он выглядит так: **5N9DA470** — по нему мы быстрее всего найдём бронирование.',
            'Бронирование держит заведение, а не мы.',
          ],
          zh: [
            '请提供确认邮件中的预订编号，格式类似 **5N9DA470**，这是我们找到预订最快的方式。',
            '预订由商户保留，而不是由我们保留。',
          ],
          hi: [
            'अपने पुष्टि ईमेल में दिया गया रेफ़रेंस नंबर बताएँ। यह **5N9DA470** जैसा दिखता है, और बुकिंग ढूँढने का यही हमारे लिए सबसे तेज़ तरीका है।',
            'बुकिंग उस जगह के पास रहती है, हमारे पास नहीं।',
          ],
          bn: [
            'আপনার কনফার্মেশন ইমেলে থাকা রেফারেন্সটি উল্লেখ করুন। দেখতে **5N9DA470**-এর মতো, আর বুকিং খুঁজে পাওয়ার জন্য এটাই আমাদের সবচেয়ে দ্রুত উপায়।',
            'বুকিং থাকে জায়গাটির কাছে, আমাদের কাছে নয়।',
          ],
          ur: [
            'اپنی تصدیقی ای میل میں دیا گیا ریفرنس بتائیں۔ یہ **5N9DA470** جیسا دکھتا ہے، اور بکنگ ڈھونڈنے کا یہ ہمارے لیے سب سے تیز طریقہ ہے۔',
            'بکنگ مقام کے پاس ہوتی ہے، ہمارے پاس نہیں۔',
          ],
        }),
      },
      {
        heading: pick(locale, {
          en: 'If you are a business',
          ar: 'إذا كنت صاحب عمل',
          fr: 'Si vous êtes un établissement',
          es: 'Si tienes un negocio',
          pt: 'Se você tem um negócio',
          ru: 'Если вы представляете заведение',
          zh: '如果您是商户',
          hi: 'अगर आप एक व्यवसाय हैं',
          bn: 'আপনার যদি ব্যবসা থাকে',
          ur: 'اگر آپ کا کاروبار ہے',
        }),
        body: pick(locale, {
          en: [
            'To be listed, see **Add your business**. To advertise in the magazine, see **Advertise with us**.',
            'If you already have a partner account and cannot sign in, say so here and we will sort it out rather than sending you round a reset loop.',
          ],
          ar: [
            'لإدراج مكانك، انظر **أضف عملك**. للإعلان في المجلة، انظر **أعلن معنا**.',
            'وإذا كان لديك حساب شريك ولا تستطيع الدخول، أخبرنا هنا ونحلّها بدل أن ندور بك في حلقة استعادة كلمة السر.',
          ],
          fr: [
            'Pour être référencé, voyez **Ajouter votre établissement**. Pour faire de la publicité dans le magazine, voyez **Annoncez chez nous**.',
            "Si vous avez déjà un compte partenaire et n'arrivez pas à vous connecter, dites-le ici : nous réglerons le problème plutôt que de vous faire tourner en rond avec des réinitialisations.",
          ],
          es: [
            'Para aparecer en el directorio, consulta **Añade tu negocio**. Para anunciarte en la revista, consulta **Anúnciate con nosotros**.',
            'Si ya tienes una cuenta de socio y no puedes iniciar sesión, dínoslo aquí y lo resolveremos en lugar de mandarte a dar vueltas con restablecimientos de contraseña.',
          ],
          pt: [
            'Para aparecer no diretório, veja **Adicione seu negócio**. Para anunciar na revista, veja **Anuncie conosco**.',
            'Se você já tem uma conta de parceiro e não consegue entrar, avise aqui e resolvemos, em vez de deixar você preso num ciclo de redefinição de senha.',
          ],
          ru: [
            'Чтобы попасть в справочник, см. **Добавить своё заведение**. Чтобы разместить рекламу в журнале, см. **Реклама у нас**.',
            'Если у вас уже есть партнёрский аккаунт и вы не можете войти, напишите об этом здесь — мы разберёмся сами, а не будем гонять вас по кругу сброса пароля.',
          ],
          zh: [
            '想被收录，请看**添加您的商户**。想在杂志上投放广告，请看**在我们这里投放广告**。',
            '如果您已有合作伙伴账户却无法登录，请在这里告诉我们，我们会直接解决，而不是让您在重置密码的流程里兜圈子。',
          ],
          hi: [
            'लिस्टिंग के लिए देखें **अपना व्यवसाय जोड़ें**। पत्रिका में विज्ञापन के लिए देखें **हमारे साथ विज्ञापन दें**।',
            'अगर आपके पास पहले से साझेदार खाता है और आप साइन इन नहीं कर पा रहे, तो यहाँ बताइए; हम आपको पासवर्ड रीसेट के चक्कर में घुमाने के बजाय ख़ुद मामला सुलझा देंगे।',
          ],
          bn: [
            'লিস্টিংয়ের জন্য দেখুন **আপনার ব্যবসা যোগ করুন**। ম্যাগাজিনে বিজ্ঞাপনের জন্য দেখুন **আমাদের সাথে বিজ্ঞাপন দিন**।',
            'আপনার যদি আগে থেকেই অংশীদার অ্যাকাউন্ট থাকে আর সাইন ইন করতে না পারেন, এখানে জানান; পাসওয়ার্ড রিসেটের চক্করে না ঘুরিয়ে আমরা নিজেরাই সমাধান করে দেব।',
          ],
          ur: [
            'لسٹنگ کے لیے دیکھیں **اپنا کاروبار شامل کریں**۔ میگزین میں اشتہار کے لیے دیکھیں **ہمارے ساتھ اشتہار دیں**۔',
            'اگر آپ کا پہلے سے شراکت دار اکاؤنٹ ہے اور آپ سائن اِن نہیں کر پا رہے تو یہاں بتائیں؛ ہم آپ کو پاس ورڈ ری سیٹ کے چکر میں ڈالنے کے بجائے خود مسئلہ حل کر دیں گے۔',
          ],
        }),
      },
      {
        heading: pick(locale, {
          en: 'How to reach us',
          ar: 'كيف تصل إلينا',
          fr: 'Comment nous joindre',
          es: 'Cómo contactarnos',
          pt: 'Como falar conosco',
          ru: 'Как с нами связаться',
          zh: '联系方式',
          hi: 'हम तक कैसे पहुँचें',
          bn: 'কীভাবে আমাদের কাছে পৌঁছাবেন',
          ur: 'ہم سے کیسے رابطہ کریں',
        }),
        body: [
          contactEmail(locale),
          contactPostal(locale),
          // No hours or reply time are promised: the owner chose on 9 November
          // 2026 to show only the two ways to reach us.
        ],
      },
    ],
  }
}

// ----------------------------------------------------------------------- faq

/**
 * The last question is about the reader's own language, so it is asked in each.
 *
 * It used to be "Is the site available in Arabic?" everywhere, which was the
 * right question for the only other language there was. A French reader should
 * be told about French. Every answer says the same two things, because both
 * are true in every language: the legal documents are translated but the
 * English governs (since 9 November 2026), and listing descriptions are mostly
 * Lebanese Arabic in Latin letters, the same in every language for now.
 */
const LANGUAGE_QUESTION: Record<Locale, { heading: string; body: string[] }> = {
  en: {
    heading: 'Is the site available in Arabic?',
    body: [
      'Yes. The site, your account, booking and these pages are in Arabic and eight other languages besides English, and the language switcher is in the header.',
      'The privacy policy and terms are in every language too. If a translation ever differs from the English, the English applies.',
      'Listing descriptions are mostly written in Lebanese Arabic in Latin letters, the way people text here, and for now they read the same in every language.',
    ],
  },
  ar: {
    heading: 'هل الموقع متوفر بالعربية؟',
    body: [
      'نعم. الموقع وحسابك والحجز وهذه الصفحات كلها بالعربية، ومبدّل اللغة في أعلى الصفحة.',
      'سياسة الخصوصية وشروط الاستخدام متوفرة أيضاً بكل اللغات. وإذا اختلفت الترجمة يوماً عن النص الإنجليزي، يُعتمد النص الإنجليزي.',
      'وأوصاف الأماكن مكتوبة في الغالب باللهجة اللبنانية بأحرف لاتينية، كما يُكتب في الرسائل هنا، وتظهر كما هي في كل اللغات حالياً.',
    ],
  },
  fr: {
    heading: 'Le site est-il disponible en français ?',
    body: [
      "Oui. Le site, votre compte, la réservation et ces pages sont en français, et le sélecteur de langue se trouve dans l'en-tête.",
      "La politique de confidentialité et les conditions d'utilisation existent aussi dans toutes les langues. Si une traduction diffère un jour de l'anglais, c'est l'anglais qui s'applique.",
      "Les descriptions des lieux sont en grande partie écrites en arabe libanais en lettres latines, comme on l'écrit dans les messages ici, et s'affichent pour l'instant telles quelles dans toutes les langues.",
    ],
  },
  es: {
    heading: '¿El sitio está disponible en español?',
    body: [
      'Sí. El sitio, tu cuenta, las reservas y estas páginas están en español, y el selector de idioma está en la cabecera.',
      'La política de privacidad y las condiciones de uso también están en todos los idiomas. Si alguna traducción difiere del inglés, se aplica el inglés.',
      'Las descripciones de los lugares están escritas, en su mayoría, en árabe libanés con letras latinas, como se escribe en los mensajes aquí, y por ahora se muestran igual en todos los idiomas.',
    ],
  },
  pt: {
    heading: 'O site está disponível em português?',
    body: [
      'Sim. O site, sua conta, as reservas e estas páginas estão em português, e o seletor de idioma fica no cabeçalho.',
      'A política de privacidade e os termos de uso também estão em todos os idiomas. Se alguma tradução for diferente do inglês, vale o inglês.',
      'As descrições dos lugares estão escritas, na maior parte, em árabe libanês com letras latinas, como se escreve nas mensagens aqui, e por enquanto aparecem iguais em todos os idiomas.',
    ],
  },
  ru: {
    heading: 'Есть ли сайт на русском?',
    body: [
      'Да. Сайт, ваш аккаунт, бронирование и эти страницы доступны на русском, а переключатель языка находится в шапке сайта.',
      'Политика конфиденциальности и условия использования тоже есть на всех языках. Если перевод когда-либо расходится с английским текстом, применяется английский.',
      'Описания мест в основном написаны на ливанском арабском латинскими буквами, как здесь пишут в сообщениях, и пока одинаковы на всех языках.',
    ],
  },
  zh: {
    heading: '网站有中文版吗？',
    body: [
      '有。网站、您的账户、预订流程和这些页面都有中文版，语言切换按钮在页面顶部。',
      '隐私政策和使用条款也有各语言版本。如译本与英文有任何不一致，以英文为准。',
      '商户介绍大多用拉丁字母书写的黎巴嫩阿拉伯语撰写，就像当地人发消息时那样，目前在所有语言版本中都显示相同的文字。',
    ],
  },
  hi: {
    heading: 'क्या साइट हिंदी में उपलब्ध है?',
    body: [
      'हाँ। साइट, आपका खाता, बुकिंग और ये पेज हिंदी में हैं, और भाषा बदलने का विकल्प ऊपर हेडर में है।',
      'गोपनीयता नीति और उपयोग की शर्तें भी हर भाषा में हैं। अगर कभी कोई अनुवाद अंग्रेज़ी से अलग हो, तो अंग्रेज़ी ही मान्य होगी।',
      'जगहों के विवरण ज़्यादातर लेबनानी अरबी में लैटिन अक्षरों में लिखे गए हैं, जैसे यहाँ संदेशों में लिखा जाता है, और फ़िलहाल हर भाषा में वैसे ही दिखते हैं।',
    ],
  },
  bn: {
    heading: 'সাইটটি কি বাংলায় পাওয়া যায়?',
    body: [
      'হ্যাঁ। সাইট, আপনার অ্যাকাউন্ট, বুকিং আর এই পেজগুলো বাংলায় আছে, আর ভাষা বদলানোর বোতাম ওপরের হেডারে।',
      'গোপনীয়তা নীতি ও ব্যবহারের শর্তাবলিও প্রতিটি ভাষায় আছে। কোনো অনুবাদ কখনো ইংরেজি থেকে আলাদা হলে, ইংরেজিটিই প্রযোজ্য।',
      'জায়গাগুলোর বিবরণ বেশিরভাগই লাতিন অক্ষরে লেবানিজ আরবিতে লেখা, যেভাবে এখানে মেসেজে লেখা হয়, আর আপাতত প্রতিটি ভাষায় একই রকম দেখায়।',
    ],
  },
  ur: {
    heading: 'کیا سائٹ اردو میں دستیاب ہے؟',
    body: [
      'جی ہاں۔ سائٹ، آپ کا اکاؤنٹ، بکنگ اور یہ صفحات اردو میں ہیں، اور زبان بدلنے کا بٹن اوپر ہیڈر میں ہے۔',
      'رازداری کی پالیسی اور استعمال کی شرائط بھی ہر زبان میں موجود ہیں۔ اگر کبھی کوئی ترجمہ انگریزی سے مختلف ہو تو انگریزی ہی معتبر ہوگی۔',
      'مقامات کی تفصیل زیادہ تر لاطینی حروف میں لبنانی عربی میں لکھی گئی ہے، جیسے یہاں پیغامات میں لکھی جاتی ہے، اور فی الحال ہر زبان میں ویسی ہی دکھائی دیتی ہے۔',
    ],
  },
}

export function faqPage(locale: Locale = 'en'): ContentPage {
  return {
    title: pick(locale, {
      en: 'Questions',
      ar: 'أسئلة شائعة',
      fr: 'Questions',
      es: 'Preguntas',
      pt: 'Perguntas',
      ru: 'Вопросы',
      zh: '常见问题',
      hi: 'सवाल',
      bn: 'প্রশ্ন',
      ur: 'سوالات',
    }),
    intro: pick(locale, {
      en: 'The things people ask most often, answered plainly.',
      ar: 'أكثر ما يُسأل عنه، بإجابات واضحة.',
      fr: "Ce qu'on nous demande le plus souvent, avec des réponses claires.",
      es: 'Lo que más nos preguntan, con respuestas claras.',
      pt: 'O que mais nos perguntam, com respostas diretas.',
      ru: 'То, о чём спрашивают чаще всего, — с простыми ответами.',
      zh: '大家最常问的问题，直截了当地回答。',
      hi: 'लोग जो सबसे ज़्यादा पूछते हैं, सीधे-सादे जवाबों के साथ।',
      bn: 'মানুষ যা সবচেয়ে বেশি জিজ্ঞেস করেন, সোজাসাপ্টা উত্তরসহ।',
      ur: 'لوگ جو سب سے زیادہ پوچھتے ہیں، سیدھے سادے جوابات کے ساتھ۔',
    }),
    sections: [
      {
        heading: pick(locale, {
          en: 'Is Vardenia free to use?',
          ar: 'هل استخدام فاردينيا مجاني؟',
          fr: 'Vardenia est-il gratuit ?',
          es: '¿Vardenia es gratuito?',
          pt: 'A Vardenia é gratuita?',
          ru: 'Пользоваться Vardenia бесплатно?',
          zh: '使用 Vardenia 免费吗？',
          hi: 'क्या Vardenia इस्तेमाल करना मुफ़्त है?',
          bn: 'Vardenia ব্যবহার করা কি বিনামূল্যে?',
          ur: 'کیا Vardenia استعمال کرنا مفت ہے؟',
        }),
        body: pick(locale, {
          en: [
            'Yes. Reading the site, browsing listings, booking and reading the magazine online all cost nothing.',
            'Browsing needs no account. Booking does, because a venue holding a table needs to know it can reach you.',
          ],
          ar: [
            'نعم. قراءة الموقع وتصفّح الأماكن والحجز وقراءة المجلة إلكترونياً، كلها بلا مقابل.',
            'التصفّح لا يحتاج حساباً. الحجز يحتاج، لأن المكان الذي يحجز لك طاولة يحتاج أن يعرف كيف يصل إليك.',
          ],
          fr: [
            'Oui. Lire le site, parcourir les fiches, réserver et lire le magazine en ligne ne coûtent rien.',
            "Parcourir ne demande aucun compte. Réserver, si : un établissement qui vous garde une table doit savoir qu'il peut vous joindre.",
          ],
          es: [
            'Sí. Leer el sitio, ver las fichas, reservar y leer la revista en línea no cuesta nada.',
            'Para mirar no hace falta cuenta. Para reservar, sí, porque un local que te guarda una mesa necesita saber que puede contactarte.',
          ],
          pt: [
            'Sim. Ler o site, navegar pelas fichas, reservar e ler a revista online não custam nada.',
            'Para navegar não precisa de conta. Para reservar, sim, porque um estabelecimento que segura uma mesa precisa saber que consegue falar com você.',
          ],
          ru: [
            'Да. Читать сайт, смотреть карточки, бронировать и читать журнал онлайн — всё бесплатно.',
            'Для просмотра аккаунт не нужен. Для бронирования нужен: заведению, которое держит для вас столик, важно знать, что с вами можно связаться.',
          ],
          zh: [
            '免费。浏览网站、查看商户、预订以及在线阅读杂志，全都不收费。',
            '浏览无需账户。预订则需要，因为为您保留餐位的商户需要确认能联系到您。',
          ],
          hi: [
            'हाँ। साइट पढ़ना, लिस्टिंग देखना, बुकिंग करना और पत्रिका ऑनलाइन पढ़ना, सब मुफ़्त है।',
            'देखने के लिए खाते की ज़रूरत नहीं। बुकिंग के लिए है, क्योंकि जो जगह आपके लिए मेज़ रोककर रखती है उसे यह पता होना चाहिए कि वह आपसे संपर्क कर सकती है।',
          ],
          bn: [
            'হ্যাঁ। সাইট পড়া, লিস্টিং দেখা, বুকিং করা আর অনলাইনে ম্যাগাজিন পড়া, সবই বিনামূল্যে।',
            'দেখার জন্য অ্যাকাউন্ট লাগে না। বুকিংয়ের জন্য লাগে, কারণ যে জায়গা আপনার জন্য টেবিল ধরে রাখছে, তাদের জানা দরকার যে আপনার সঙ্গে যোগাযোগ করা যাবে।',
          ],
          ur: [
            'جی ہاں۔ سائٹ پڑھنا، لسٹنگز دیکھنا، بکنگ کرنا اور میگزین آن لائن پڑھنا، سب مفت ہے۔',
            'دیکھنے کے لیے اکاؤنٹ کی ضرورت نہیں۔ بکنگ کے لیے ہے، کیونکہ جو مقام آپ کے لیے میز روک کر رکھتا ہے اسے یہ معلوم ہونا چاہیے کہ وہ آپ سے رابطہ کر سکتا ہے۔',
          ],
        }),
      },
      {
        heading: pick(locale, {
          en: 'Do I need an account to book?',
          ar: 'هل أحتاج حساباً لأحجز؟',
          fr: 'Faut-il un compte pour réserver ?',
          es: '¿Necesito una cuenta para reservar?',
          pt: 'Preciso de uma conta para reservar?',
          ru: 'Нужен ли аккаунт, чтобы забронировать?',
          zh: '预订需要账户吗？',
          hi: 'क्या बुकिंग के लिए खाता चाहिए?',
          bn: 'বুকিং করতে কি অ্যাকাউন্ট লাগবে?',
          ur: 'کیا بکنگ کے لیے اکاؤنٹ ضروری ہے؟',
        }),
        body: pick(locale, {
          en: [
            'Yes, and it takes a minute. You sign up with your name and email address, then confirm the address from the link we send you. Bookings only go through once the address is confirmed, so that a venue keeping a table free is not doing it for somebody who cannot be reached.',
            'If the link has not arrived after a few minutes, look in your junk folder.',
            'Everything you book is then kept in one place, and you can cancel from there.',
          ],
          ar: [
            'نعم، ولا يستغرق الأمر أكثر من دقيقة. تسجّل باسمك وبريدك الإلكتروني، ثم تؤكّد البريد من الرابط الذي نرسله لك. لا يمر الحجز قبل تأكيد البريد، حتى لا يبقي مكانٌ طاولةً فارغة لشخص لا يمكن الوصول إليه.',
            'إذا لم يصل الرابط خلال دقائق، ابحث في مجلد الرسائل غير المرغوب فيها.',
            'وبعدها تبقى كل حجوزاتك في مكان واحد، ويمكنك الإلغاء من هناك.',
          ],
          fr: [
            "Oui, et cela prend une minute. Vous vous inscrivez avec votre nom et votre adresse e-mail, puis vous confirmez l'adresse grâce au lien que nous vous envoyons. Une réservation n'aboutit qu'une fois l'adresse confirmée, pour qu'un établissement qui garde une table libre ne le fasse pas pour quelqu'un d'injoignable.",
            "Si le lien n'est pas arrivé au bout de quelques minutes, regardez dans vos courriers indésirables.",
            'Tout ce que vous réservez est ensuite réuni au même endroit, et vous pouvez annuler depuis là.',
          ],
          es: [
            'Sí, y lleva un minuto. Te registras con tu nombre y tu correo electrónico, y luego confirmas la dirección con el enlace que te enviamos. Las reservas solo se tramitan cuando la dirección está confirmada, para que un local que guarda una mesa libre no lo haga por alguien a quien no se puede localizar.',
            'Si el enlace no ha llegado en unos minutos, mira en la carpeta de correo no deseado.',
            'Después, todo lo que reserves queda en un solo lugar, y puedes cancelar desde ahí.',
          ],
          pt: [
            'Sim, e leva um minuto. Você se cadastra com seu nome e e-mail e depois confirma o endereço pelo link que enviamos. As reservas só são feitas depois que o endereço é confirmado, para que um estabelecimento que segura uma mesa não faça isso para alguém que não pode ser contatado.',
            'Se o link não chegar em alguns minutos, olhe na pasta de spam.',
            'Depois, tudo o que você reservar fica em um só lugar, e você pode cancelar por lá.',
          ],
          ru: [
            'Да, и это займёт минуту. Вы регистрируетесь с именем и адресом электронной почты, а затем подтверждаете адрес по ссылке, которую мы пришлём. Бронирование проходит только после подтверждения адреса, чтобы заведение не держало свободный столик для того, с кем невозможно связаться.',
            'Если ссылка не пришла через несколько минут, проверьте папку «Спам».',
            'После этого все ваши бронирования хранятся в одном месте, и отменить их можно оттуда же.',
          ],
          zh: [
            '需要，只要一分钟。用您的姓名和电子邮箱注册，然后点击我们发送的链接确认邮箱。只有邮箱确认后预订才会生效，这样商户为您留出的餐位不会留给一个联系不上的人。',
            '如果几分钟后仍未收到链接，请查看垃圾邮件文件夹。',
            '之后，您的所有预订都集中在一处，也可以在那里取消。',
          ],
          hi: [
            'हाँ, और इसमें एक मिनट लगता है। आप अपने नाम और ईमेल पते से साइन अप करते हैं, फिर हमारे भेजे लिंक से पते की पुष्टि करते हैं। बुकिंग तभी आगे बढ़ती है जब पते की पुष्टि हो जाए, ताकि कोई जगह ऐसे व्यक्ति के लिए मेज़ ख़ाली न रखे जिससे संपर्क ही न हो सके।',
            'अगर कुछ मिनट बाद भी लिंक नहीं आया, तो अपना जंक फ़ोल्डर देखें।',
            'इसके बाद आपकी हर बुकिंग एक ही जगह रहती है, और आप वहीं से रद्द कर सकते हैं।',
          ],
          bn: [
            'হ্যাঁ, আর এতে এক মিনিট লাগে। আপনার নাম ও ইমেল ঠিকানা দিয়ে সাইন আপ করুন, তারপর আমাদের পাঠানো লিংক থেকে ঠিকানাটি নিশ্চিত করুন। ঠিকানা নিশ্চিত হওয়ার পরই বুকিং সম্পন্ন হয়, যাতে কোনো জায়গা এমন কারও জন্য টেবিল খালি না রাখে যাঁর সঙ্গে যোগাযোগই করা যায় না।',
            'কয়েক মিনিট পরেও লিংক না এলে জাঙ্ক ফোল্ডারে দেখুন।',
            'এরপর আপনার সব বুকিং এক জায়গায় থাকে, আর সেখান থেকেই বাতিল করতে পারেন।',
          ],
          ur: [
            'جی ہاں، اور اس میں ایک منٹ لگتا ہے۔ آپ اپنے نام اور ای میل پتے سے سائن اپ کرتے ہیں، پھر ہمارے بھیجے گئے لنک سے پتے کی تصدیق کرتے ہیں۔ بکنگ تبھی ہوتی ہے جب پتے کی تصدیق ہو جائے، تاکہ کوئی مقام ایسے شخص کے لیے میز خالی نہ رکھے جس سے رابطہ ہی نہ ہو سکے۔',
            'اگر چند منٹ بعد بھی لنک نہ آئے تو اپنا جنک فولڈر دیکھیں۔',
            'اس کے بعد آپ کی ہر بکنگ ایک ہی جگہ رہتی ہے، اور آپ وہیں سے منسوخ کر سکتے ہیں۔',
          ],
        }),
      },
      {
        heading: pick(locale, {
          en: 'Can you book for me over WhatsApp?',
          ar: 'هل تحجزون لي عبر واتساب؟',
          fr: 'Pouvez-vous réserver pour moi par WhatsApp ?',
          es: '¿Pueden reservar por mí a través de WhatsApp?',
          pt: 'Vocês podem reservar para mim pelo WhatsApp?',
          ru: 'Можете забронировать за меня через WhatsApp?',
          zh: '可以通过 WhatsApp 帮我预订吗？',
          hi: 'क्या आप WhatsApp पर मेरे लिए बुकिंग कर सकते हैं?',
          bn: 'আপনারা কি WhatsApp-এ আমার হয়ে বুকিং করে দিতে পারেন?',
          ur: 'کیا آپ WhatsApp پر میرے لیے بکنگ کر سکتے ہیں؟',
        }),
        body: pick(locale, {
          en: [
            'Yes. Message us and we will make the booking for you, using your name and email address.',
            'You will get a confirmation like anyone else. If you later want to see your bookings on the site, sign up with the same email address and they will be there.',
          ],
          ar: [
            'نعم. راسلنا ونحجز لك، باسمك وبريدك الإلكتروني.',
            'ستصلك رسالة تأكيد كأي شخص آخر. وإذا أردت لاحقاً أن ترى حجوزاتك على الموقع، سجّل بالبريد نفسه وستجدها بانتظارك.',
          ],
          fr: [
            'Oui. Écrivez-nous et nous ferons la réservation pour vous, à votre nom et avec votre adresse e-mail.',
            'Vous recevrez une confirmation comme tout le monde. Si vous voulez plus tard retrouver vos réservations sur le site, inscrivez-vous avec la même adresse e-mail : elles vous y attendront.',
          ],
          es: [
            'Sí. Escríbenos y haremos la reserva por ti, con tu nombre y tu correo electrónico.',
            'Recibirás una confirmación como cualquier otra persona. Si más adelante quieres ver tus reservas en el sitio, regístrate con el mismo correo y allí estarán.',
          ],
          pt: [
            'Sim. Mande uma mensagem e fazemos a reserva para você, com seu nome e e-mail.',
            'Você recebe uma confirmação como qualquer pessoa. Se depois quiser ver suas reservas no site, cadastre-se com o mesmo e-mail e elas estarão lá.',
          ],
          ru: [
            'Да. Напишите нам, и мы забронируем за вас — на ваше имя и адрес электронной почты.',
            'Вы получите подтверждение, как и все. Если позже захотите видеть свои бронирования на сайте, зарегистрируйтесь с тем же адресом — они уже будут там.',
          ],
          zh: [
            '可以。给我们发消息，我们会用您的姓名和电子邮箱替您预订。',
            '您会和其他人一样收到确认。以后如果想在网站上查看预订，用同一个邮箱注册即可，预订都会在那里。',
          ],
          hi: [
            'हाँ। हमें संदेश भेजें और हम आपके नाम और ईमेल पते से आपके लिए बुकिंग कर देंगे।',
            'आपको भी बाक़ी सबकी तरह पुष्टि मिलेगी। अगर बाद में आप साइट पर अपनी बुकिंग देखना चाहें, तो उसी ईमेल पते से साइन अप करें, वे वहाँ मिलेंगी।',
          ],
          bn: [
            'হ্যাঁ। আমাদের মেসেজ করুন, আপনার নাম ও ইমেল ঠিকানা দিয়ে আমরা আপনার হয়ে বুকিং করে দেব।',
            'অন্য সবার মতোই আপনি কনফার্মেশন পাবেন। পরে সাইটে নিজের বুকিং দেখতে চাইলে একই ইমেল ঠিকানা দিয়ে সাইন আপ করুন, সেগুলো সেখানেই থাকবে।',
          ],
          ur: [
            'جی ہاں۔ ہمیں پیغام بھیجیں اور ہم آپ کے نام اور ای میل پتے سے آپ کے لیے بکنگ کر دیں گے۔',
            'آپ کو بھی باقی سب کی طرح تصدیق ملے گی۔ اگر بعد میں آپ سائٹ پر اپنی بکنگز دیکھنا چاہیں تو اسی ای میل پتے سے سائن اپ کریں، وہ وہاں موجود ہوں گی۔',
          ],
        }),
      },
      {
        heading: pick(locale, {
          en: 'Is my booking confirmed straight away?',
          ar: 'هل يتأكد الحجز فوراً؟',
          fr: 'Ma réservation est-elle confirmée tout de suite ?',
          es: '¿Mi reserva se confirma al momento?',
          pt: 'Minha reserva é confirmada na hora?',
          ru: 'Бронирование подтверждается сразу?',
          zh: '预订会立即确认吗？',
          hi: 'क्या मेरी बुकिंग तुरंत पक्की हो जाती है?',
          bn: 'আমার বুকিং কি সঙ্গে সঙ্গে নিশ্চিত হয়?',
          ur: 'کیا میری بکنگ فوراً کنفرم ہو جاتی ہے؟',
        }),
        body: pick(locale, {
          en: [
            'It depends on the venue. Some confirm immediately; others want to look at the book first, and those arrive as a request.',
            'Either way you are told by email what happened, and the listing says which kind it is before you send anything.',
          ],
          ar: [
            'يعتمد على المكان. بعضهم يؤكد فوراً، وبعضهم يريد مراجعة دفتر الحجوزات أولاً، فيصل الطلب عندهم كطلب لا كتأكيد.',
            'في الحالتين نخبرك بالبريد بما حدث، وصفحة المكان تقول أي النوعين هو قبل أن ترسل أي شيء.',
          ],
          fr: [
            "Cela dépend de l'établissement. Certains confirment immédiatement ; d'autres veulent d'abord consulter leur carnet, et la réservation leur arrive alors sous forme de demande.",
            "Dans les deux cas, vous êtes informé par e-mail de la suite, et la fiche indique de quel type il s'agit avant que vous n'envoyiez quoi que ce soit.",
          ],
          es: [
            'Depende del local. Algunos confirman al instante; otros prefieren revisar antes su libro de reservas, y a esos les llega como solicitud.',
            'En cualquier caso te avisamos por correo de lo que ha pasado, y la ficha indica de qué tipo es antes de que envíes nada.',
          ],
          pt: [
            'Depende do estabelecimento. Alguns confirmam na hora; outros preferem olhar a agenda antes, e para esses o pedido chega como solicitação.',
            'De qualquer forma, você fica sabendo por e-mail o que aconteceu, e a ficha diz de que tipo é antes de você enviar qualquer coisa.',
          ],
          ru: [
            'Зависит от заведения. Одни подтверждают сразу; другие сначала хотят свериться с книгой бронирований, и к ним бронирование приходит как запрос.',
            'В любом случае мы сообщим вам по почте, чем всё закончилось, а на странице заведения указано, какой это вариант, ещё до того, как вы что-то отправите.',
          ],
          zh: [
            '这取决于商户。有些会立即确认；有些想先看看预订簿，这类预订会以请求的形式送达。',
            '无论哪种情况，结果都会通过邮件告诉您；而且在您提交之前，商户页面就会注明属于哪一种。',
          ],
          hi: [
            'यह उस जगह पर निर्भर करता है। कुछ तुरंत पुष्टि कर देती हैं; कुछ पहले अपनी बुकिंग देखना चाहती हैं, और उनके पास यह एक अनुरोध के रूप में पहुँचती है।',
            'दोनों ही सूरतों में आपको ईमेल से बताया जाता है कि क्या हुआ, और कुछ भी भेजने से पहले लिस्टिंग पर लिखा होता है कि वह किस तरह की है।',
          ],
          bn: [
            'এটা জায়গাটির ওপর নির্ভর করে। কেউ সঙ্গে সঙ্গে নিশ্চিত করে; কেউ আগে নিজেদের বুকিংয়ের খাতা দেখে নিতে চায়, তাদের কাছে এটি অনুরোধ হিসেবে পৌঁছায়।',
            'যেভাবেই হোক, কী হলো তা আপনাকে ইমেলে জানানো হয়, আর কিছু পাঠানোর আগেই লিস্টিংয়ে লেখা থাকে সেটি কোন ধরনের।',
          ],
          ur: [
            'یہ مقام پر منحصر ہے۔ کچھ فوراً تصدیق کر دیتے ہیں؛ کچھ پہلے اپنی بکنگ دیکھنا چاہتے ہیں، اور ان کے پاس یہ ایک درخواست کی صورت میں پہنچتی ہے۔',
            'دونوں صورتوں میں آپ کو ای میل سے بتایا جاتا ہے کہ کیا ہوا، اور کچھ بھیجنے سے پہلے ہی لسٹنگ پر لکھا ہوتا ہے کہ وہ کس قسم کی ہے۔',
          ],
        }),
      },
      {
        heading: pick(locale, {
          en: 'I scanned a code and the listing had moved',
          ar: 'مسحت رمزاً فوجدت أن المكان لم يعد موجوداً',
          fr: "J'ai scanné un code et la fiche n'était plus là",
          es: 'Escaneé un código y la ficha ya no estaba',
          pt: 'Escaneei um código e a ficha não estava mais lá',
          ru: 'Я отсканировал код, а карточки уже нет',
          zh: '我扫了二维码，但商户页面已经不在了',
          hi: 'मैंने कोड स्कैन किया और लिस्टिंग वहाँ नहीं थी',
          bn: 'কোড স্ক্যান করলাম, কিন্তু লিস্টিংটি আর নেই',
          ur: 'میں نے کوڈ اسکین کیا مگر لسٹنگ وہاں نہیں تھی',
        }),
        body: pick(locale, {
          en: [
            'That means the business is no longer with us, or the listing was withdrawn after the issue printed. The code still works and always will; it just explains itself instead of opening a page that is no longer true.',
            'The page it lands on offers the rest of the directory, which is usually what you wanted anyway.',
          ],
          ar: [
            'هذا يعني أن المكان لم يعد معنا، أو أن إدراجه سُحب بعد طباعة العدد. الرمز ما زال يعمل وسيبقى يعمل؛ لكنه يشرح نفسه بدل أن يفتح صفحة لم تعد صحيحة.',
            'والصفحة التي يصل إليها تعرض عليك بقية الدليل، وهو غالباً ما كنت تبحث عنه أصلاً.',
          ],
          fr: [
            "Cela signifie que l'établissement n'est plus avec nous, ou que la fiche a été retirée après l'impression du numéro. Le code fonctionne toujours et fonctionnera toujours ; il s'explique simplement au lieu d'ouvrir une page qui n'est plus exacte.",
            "La page d'arrivée vous propose le reste de l'annuaire, ce qui est généralement ce que vous cherchiez de toute façon.",
          ],
          es: [
            'Significa que el negocio ya no está con nosotros, o que la ficha se retiró después de imprimirse el número. El código sigue funcionando y siempre lo hará; simplemente se explica en lugar de abrir una página que ya no es cierta.',
            'La página a la que llega te ofrece el resto del directorio, que suele ser lo que buscabas de todos modos.',
          ],
          pt: [
            'Isso significa que o negócio não está mais conosco, ou que a ficha foi retirada depois que a edição foi impressa. O código continua funcionando e sempre vai funcionar; ele só se explica em vez de abrir uma página que não é mais verdadeira.',
            'A página em que ele cai oferece o resto do diretório, que geralmente é o que você queria mesmo.',
          ],
          ru: [
            'Это значит, что заведение больше не с нами или его карточку сняли после выхода номера. Код по-прежнему работает и будет работать всегда; просто он объясняет, что произошло, вместо того чтобы открыть страницу, которая уже не соответствует действительности.',
            'Страница, на которую он ведёт, предлагает остальной справочник — обычно это и есть то, что вам было нужно.',
          ],
          zh: [
            '这说明该商户已不再与我们合作，或者其页面在杂志印刷后被撤下了。二维码依然有效，并且会一直有效；它只是会说明情况，而不是打开一个内容已经不属实的页面。',
            '它跳转的页面会为您展示指南中的其他商户，这通常也正是您本来想找的。',
          ],
          hi: [
            'इसका मतलब है कि वह व्यवसाय अब हमारे साथ नहीं है, या अंक छपने के बाद लिस्टिंग हटा ली गई। कोड अब भी काम करता है और हमेशा करेगा; बस ऐसा पेज खोलने के बजाय जो अब सही नहीं है, वह बताता है कि क्या हुआ।',
            'जिस पेज पर वह ले जाता है, वहाँ बाक़ी निर्देशिका मिलती है, जो अक्सर वही होती है जो आप ढूँढ रहे थे।',
          ],
          bn: [
            'এর মানে ব্যবসাটি আর আমাদের সঙ্গে নেই, অথবা সংখ্যাটি ছাপার পরে লিস্টিংটি সরিয়ে নেওয়া হয়েছে। কোডটি এখনো কাজ করে এবং সবসময় করবে; শুধু এমন একটি পেজ খোলার বদলে যা আর সত্য নয়, সেটি জানিয়ে দেয় কী হয়েছে।',
            'যে পেজে এটি নিয়ে যায়, সেখানে ডিরেক্টরির বাকি অংশ থাকে, যা সাধারণত আপনি খুঁজছিলেনই।',
          ],
          ur: [
            'اس کا مطلب ہے کہ وہ کاروبار اب ہمارے ساتھ نہیں، یا شمارہ چھپنے کے بعد لسٹنگ ہٹا دی گئی۔ کوڈ اب بھی کام کرتا ہے اور ہمیشہ کرے گا؛ بس ایسا صفحہ کھولنے کے بجائے جو اب درست نہیں، وہ بتا دیتا ہے کہ کیا ہوا۔',
            'جس صفحے پر وہ لے جاتا ہے وہاں باقی ڈائریکٹری ملتی ہے، جو اکثر وہی ہوتی ہے جس کی آپ کو تلاش تھی۔',
          ],
        }),
      },
      {
        heading: pick(locale, {
          en: 'How do I get my business listed?',
          ar: 'كيف أُدرج عملي؟',
          fr: 'Comment faire référencer mon établissement ?',
          es: '¿Cómo incluyo mi negocio en el directorio?',
          pt: 'Como coloco meu negócio no diretório?',
          ru: 'Как добавить своё заведение в справочник?',
          zh: '我的商户怎样才能被收录？',
          hi: 'मेरा व्यवसाय कैसे लिस्ट होगा?',
          bn: 'আমার ব্যবসা কীভাবে লিস্টিংয়ে আনব?',
          ur: 'میرا کاروبار کیسے لسٹ ہو گا؟',
        }),
        body: pick(locale, {
          en: [
            'See **Add your business**. Nobody can add themselves, so it starts with a message.',
          ],
          ar: ['انظر **أضف عملك**. لا يستطيع أحد أن يضيف نفسه، فالبداية تكون برسالة.'],
          fr: [
            "Voyez **Ajouter votre établissement**. Personne ne peut s'ajouter soi-même, alors tout commence par un message.",
          ],
          es: [
            'Consulta **Añade tu negocio**. Nadie puede añadirse por su cuenta, así que todo empieza con un mensaje.',
          ],
          pt: [
            'Veja **Adicione seu negócio**. Ninguém pode se adicionar sozinho, então tudo começa com uma mensagem.',
          ],
          ru: [
            'См. **Добавить своё заведение**. Добавить себя самому нельзя, поэтому всё начинается с сообщения.',
          ],
          zh: ['请看**添加您的商户**。没有人能自行加入，所以第一步是给我们发一条消息。'],
          hi: [
            'देखें **अपना व्यवसाय जोड़ें**। कोई ख़ुद को नहीं जोड़ सकता, इसलिए शुरुआत एक संदेश से होती है।',
          ],
          bn: [
            'দেখুন **আপনার ব্যবসা যোগ করুন**। কেউ নিজে নিজেকে যোগ করতে পারেন না, তাই শুরু হয় একটি বার্তা দিয়ে।',
          ],
          ur: [
            'دیکھیں **اپنا کاروبار شامل کریں**۔ کوئی خود کو شامل نہیں کر سکتا، اس لیے شروعات ایک پیغام سے ہوتی ہے۔',
          ],
        }),
      },
      {
        heading: pick(locale, {
          en: 'Can I have my data deleted?',
          ar: 'هل يمكن حذف بياناتي؟',
          fr: 'Puis-je faire supprimer mes données ?',
          es: '¿Puedo pedir que borren mis datos?',
          pt: 'Posso pedir a exclusão dos meus dados?',
          ru: 'Можно ли удалить мои данные?',
          zh: '我可以删除我的数据吗？',
          hi: 'क्या मेरा डेटा हटाया जा सकता है?',
          bn: 'আমার তথ্য কি মুছে ফেলা যায়?',
          ur: 'کیا میرا ڈیٹا حذف کیا جا سکتا ہے؟',
        }),
        body: pick(locale, {
          en: [
            'Yes, and you can do it yourself from your account without asking us. Everything identifying is removed.',
            "Bookings that already happened stay on the venue's record with nothing personal on them, because a reservation is their business record as much as yours.",
          ],
          ar: [
            'نعم، ويمكنك ذلك بنفسك من حسابك دون أن تسألنا. يُحذف كل ما يدل عليك.',
            'الحجوزات التي تمت فعلاً تبقى في سجل المكان بلا أي بيانات شخصية، لأن الحجز سجلّ تجاري لهم بقدر ما هو سجلّ لك.',
          ],
          fr: [
            'Oui, et vous pouvez le faire vous-même depuis votre compte, sans nous le demander. Tout ce qui permet de vous identifier est supprimé.',
            "Les réservations déjà passées restent dans les registres de l'établissement, sans aucune donnée personnelle, car une réservation est autant son document commercial que le vôtre.",
          ],
          es: [
            'Sí, y puedes hacerlo tú mismo desde tu cuenta sin pedírnoslo. Se elimina todo lo que te identifica.',
            'Las reservas que ya tuvieron lugar se quedan en el registro del local sin ningún dato personal, porque una reserva es tanto su registro comercial como el tuyo.',
          ],
          pt: [
            'Sim, e você mesmo pode fazer isso pela sua conta, sem nos pedir. Tudo o que identifica você é removido.',
            'As reservas que já aconteceram continuam no registro do estabelecimento, sem nada pessoal, porque uma reserva é registro comercial deles tanto quanto seu.',
          ],
          ru: [
            'Да, и вы можете сделать это сами в своём аккаунте, не обращаясь к нам. Всё, что позволяет вас идентифицировать, удаляется.',
            'Уже состоявшиеся бронирования остаются в учёте заведения без каких-либо личных данных, потому что бронирование — это такой же их деловой документ, как и ваш.',
          ],
          zh: [
            '可以，而且您可以直接在账户中自行操作，无需联系我们。所有能识别您身份的信息都会被删除。',
            '已经发生的预订会保留在商户的记录中，但不含任何个人信息，因为一次预订既是您的记录，也是商户的经营记录。',
          ],
          hi: [
            'हाँ, और आप यह हमसे पूछे बिना अपने खाते से ख़ुद कर सकते हैं। आपकी पहचान बताने वाली हर चीज़ हटा दी जाती है।',
            'जो बुकिंग हो चुकी हैं वे बिना किसी निजी जानकारी के उस जगह के रिकॉर्ड में रहती हैं, क्योंकि बुकिंग जितनी आपका रिकॉर्ड है उतना ही उनका कारोबारी रिकॉर्ड भी।',
          ],
          bn: [
            'হ্যাঁ, আর আমাদের না জিজ্ঞেস করেই আপনি নিজের অ্যাকাউন্ট থেকে এটা করতে পারেন। আপনাকে শনাক্ত করা যায় এমন সবকিছু মুছে ফেলা হয়।',
            'যে বুকিং আগেই হয়ে গেছে, সেগুলো কোনো ব্যক্তিগত তথ্য ছাড়া জায়গাটির রেকর্ডে থেকে যায়, কারণ একটি বুকিং আপনার যেমন, ওদেরও তেমনই ব্যবসায়িক রেকর্ড।',
          ],
          ur: [
            'جی ہاں، اور آپ ہم سے پوچھے بغیر اپنے اکاؤنٹ سے یہ خود کر سکتے ہیں۔ آپ کی شناخت ظاہر کرنے والی ہر چیز ہٹا دی جاتی ہے۔',
            'جو بکنگز ہو چکی ہیں وہ کسی ذاتی معلومات کے بغیر مقام کے ریکارڈ میں رہتی ہیں، کیونکہ بکنگ جتنی آپ کا ریکارڈ ہے اتنی ہی ان کا کاروباری ریکارڈ بھی۔',
          ],
        }),
      },
      LANGUAGE_QUESTION[locale],
    ],
  }
}

// ---------------------------------------------------------- partner with us

export function partnerWithUsPage(locale: Locale = 'en'): ContentPage {
  return {
    title: pick(locale, {
      en: 'Partner with us',
      ar: 'كن شريكاً',
      fr: 'Devenir partenaire',
      es: 'Colabora con nosotros',
      pt: 'Seja nosso parceiro',
      ru: 'Стать партнёром',
      zh: '成为合作伙伴',
      hi: 'हमारे साझेदार बनें',
      bn: 'আমাদের অংশীদার হোন',
      ur: 'ہمارے شراکت دار بنیں',
    }),
    intro: pick(locale, {
      en: 'A Vardenia listing puts a business in front of people who are deciding where to go, in print and online, with one code connecting the two.',
      ar: 'إدراجك في فاردينيا يضع عملك أمام من يقرر الآن إلى أين يذهب، مطبوعاً وإلكترونياً، برمز واحد يربط الاثنين.',
      fr: 'Une fiche Vardenia place un établissement sous les yeux de ceux qui décident où aller, dans le magazine comme en ligne, avec un seul code pour relier les deux.',
      es: 'Una ficha en Vardenia pone un negocio delante de quienes están decidiendo adónde ir, en papel y en línea, con un solo código que une ambos.',
      pt: 'Uma ficha na Vardenia coloca um negócio diante de quem está decidindo aonde ir, no impresso e online, com um único código ligando os dois.',
      ru: 'Карточка в Vardenia показывает заведение тем, кто прямо сейчас решает, куда пойти, — в журнале и онлайн, и один код связывает одно с другим.',
      zh: '在 Vardenia 被收录，意味着您的商户会出现在正在决定去哪儿的人面前，无论是在杂志上还是网上，一个二维码把两者连在一起。',
      hi: 'Vardenia की लिस्टिंग किसी व्यवसाय को उन लोगों के सामने रखती है जो तय कर रहे हैं कि कहाँ जाएँ, छपी पत्रिका में भी और ऑनलाइन भी, और एक कोड दोनों को जोड़ता है।',
      bn: 'Vardenia-তে একটি লিস্টিং আপনার ব্যবসাকে তুলে ধরে তাঁদের সামনে যাঁরা ঠিক করছেন কোথায় যাবেন, ছাপায় এবং অনলাইনে, আর একটি কোড দুটোকে জুড়ে দেয়।',
      ur: 'Vardenia کی لسٹنگ کسی کاروبار کو اُن لوگوں کے سامنے لاتی ہے جو طے کر رہے ہیں کہ کہاں جائیں، چھپے ہوئے میگزین میں بھی اور آن لائن بھی، اور ایک کوڈ دونوں کو جوڑتا ہے۔',
    }),
    sections: [
      {
        heading: pick(locale, {
          en: 'What a listing is',
          ar: 'ما هو الإدراج',
          fr: "Ce qu'est une fiche",
          es: 'Qué es una ficha',
          pt: 'O que é uma ficha',
          ru: 'Что такое карточка',
          zh: '收录包含什么',
          hi: 'लिस्टिंग क्या है',
          bn: 'লিস্টিং কী',
          ur: 'لسٹنگ کیا ہے',
        }),
        body: pick(locale, {
          en: [
            '- A page on the site with photographs, hours, and everything a visitor needs before they decide.',
            '- At silver and gold, a printed page in the magazine, carrying a code that opens that page.',
            '- That code never expires. It keeps working for the life of the issue and beyond, and it follows the listing if anything about the business changes.',
            '- Bookings, if the business takes them, answered from a dashboard rather than from a phone that rings during service.',
          ],
          ar: [
            '- صفحة على الموقع فيها الصور ومواعيد العمل وكل ما يحتاجه الزائر قبل أن يقرر.',
            '- في المستويين الفضي والذهبي، صفحة مطبوعة في المجلة تحمل رمزاً يفتح تلك الصفحة.',
            '- هذا الرمز لا ينتهي. يبقى يعمل طوال عمر العدد وبعده، ويتبع الإدراج مهما تغيّر في العمل.',
            '- الحجوزات، إن كان المكان يقبلها، يردّ عليها من لوحة تحكم بدل هاتف يرن في وسط الخدمة.',
          ],
          fr: [
            '- Une page sur le site, avec photos, horaires et tout ce dont un visiteur a besoin avant de se décider.',
            '- En argent et en or, une page imprimée dans le magazine, avec un code qui ouvre cette page.',
            "- Ce code n'expire jamais. Il fonctionne pendant toute la vie du numéro et au-delà, et il suit la fiche si quoi que ce soit change dans l'établissement.",
            "- Les réservations, si l'établissement en prend, gérées depuis un tableau de bord plutôt qu'au téléphone qui sonne en plein service.",
          ],
          es: [
            '- Una página en el sitio con fotos, horario y todo lo que un visitante necesita antes de decidirse.',
            '- En plata y oro, una página impresa en la revista, con un código que abre esa página.',
            '- Ese código nunca caduca. Funciona durante toda la vida del número y después, y sigue a la ficha si algo del negocio cambia.',
            '- Las reservas, si el negocio las acepta, se responden desde un panel y no desde un teléfono que suena en pleno servicio.',
          ],
          pt: [
            '- Uma página no site com fotos, horários e tudo o que um visitante precisa antes de decidir.',
            '- Em prata e ouro, uma página impressa na revista, com um código que abre essa página.',
            '- Esse código nunca expira. Ele funciona durante toda a vida da edição e depois dela, e acompanha a ficha se algo no negócio mudar.',
            '- Reservas, se o negócio aceitar, respondidas por um painel e não por um telefone que toca no meio do serviço.',
          ],
          ru: [
            '- Страница на сайте с фотографиями, часами работы и всем, что нужно гостю, прежде чем решить.',
            '- На уровнях «серебро» и «золото»: печатная страница в журнале с кодом, который открывает эту страницу.',
            '- Срок действия этого кода никогда не истекает. Он работает всё время жизни номера и дольше и следует за карточкой, если в заведении что-то меняется.',
            '- Бронирования, если заведение их принимает, — через панель управления, а не по телефону, который звонит посреди смены.',
          ],
          zh: [
            '- 网站上的一个页面，包含照片、营业时间，以及访客在做决定前需要的一切信息。',
            '- 银级和金级另有杂志上的一页印刷版面，附有可打开该页面的二维码。',
            '- 这个二维码永不过期。在整期杂志的生命周期内乃至之后都有效，商户有任何变化，它都会跟着页面走。',
            '- 如果商户接受预订，可以在管理后台处理，而不必在营业高峰时接听响个不停的电话。',
          ],
          hi: [
            '- साइट पर एक पेज, जिसमें तस्वीरें, समय और वह सब कुछ हो जो किसी आगंतुक को फ़ैसला करने से पहले चाहिए।',
            '- सिल्वर और गोल्ड में, पत्रिका में एक छपा हुआ पेज, जिस पर वह पेज खोलने वाला कोड हो।',
            '- वह कोड कभी एक्सपायर नहीं होता। वह अंक के पूरे जीवनकाल में और उसके बाद भी काम करता है, और व्यवसाय में कुछ भी बदले तो लिस्टिंग के साथ चलता है।',
            '- बुकिंग, अगर व्यवसाय लेता है, तो उनका जवाब सर्विस के बीच बजते फ़ोन के बजाय एक डैशबोर्ड से दिया जाता है।',
          ],
          bn: [
            '- সাইটে একটি পেজ, যেখানে ছবি, সময়সূচি আর সিদ্ধান্ত নেওয়ার আগে একজন অতিথির যা যা দরকার সব থাকে।',
            '- সিলভার ও গোল্ডে, ম্যাগাজিনে একটি ছাপা পাতা, যাতে সেই পেজ খোলার কোড থাকে।',
            '- সেই কোডের মেয়াদ কখনো ফুরায় না। সংখ্যাটির পুরো আয়ুষ্কাল জুড়ে এবং তার পরেও এটি কাজ করে, আর ব্যবসার কিছু বদলালে লিস্টিংকে অনুসরণ করে।',
            '- বুকিং, যদি ব্যবসাটি নেয়, তাহলে সেগুলোর উত্তর দেওয়া হয় একটি ড্যাশবোর্ড থেকে, ব্যস্ত সময়ে বেজে চলা ফোন থেকে নয়।',
          ],
          ur: [
            '- سائٹ پر ایک صفحہ جس میں تصاویر، اوقات اور وہ سب کچھ ہو جو کسی مہمان کو فیصلہ کرنے سے پہلے چاہیے۔',
            '- سلور اور گولڈ میں، میگزین میں ایک چھپا ہوا صفحہ، جس پر وہ صفحہ کھولنے والا کوڈ ہو۔',
            '- وہ کوڈ کبھی ختم نہیں ہوتا۔ یہ شمارے کی پوری عمر اور اس کے بعد بھی کام کرتا ہے، اور کاروبار میں کچھ بھی بدلے تو لسٹنگ کے ساتھ رہتا ہے۔',
            '- بکنگ، اگر کاروبار لیتا ہے، تو ان کا جواب سروس کے دوران بجتے فون کے بجائے ایک ڈیش بورڈ سے دیا جاتا ہے۔',
          ],
        }),
      },
      {
        heading: pick(locale, {
          en: 'What it is not',
          ar: 'ما ليس هو',
          fr: "Ce qu'elle n'est pas",
          es: 'Qué no es',
          pt: 'O que ela não é',
          ru: 'Чем она не является',
          zh: '它不是什么',
          hi: 'यह क्या नहीं है',
          bn: 'এটা কী নয়',
          ur: 'یہ کیا نہیں ہے',
        }),
        body: pick(locale, {
          en: [
            'It is not an advertising slot dressed as editorial. Listings are marked, and a reader can tell a listing from an article.',
            'A venue pays Vardenia a commission on what each guest who books through Vardenia and comes spends, as set out in the agreement it signs. Nothing is charged for a no-show or a cancellation, and the guest pays the venue its usual price.',
            'A listing cannot be bought into a place it does not belong. A restaurant is under Eat & Drink whether or not it pays more than the one next to it.',
          ],
          ar: [
            'ليس مساحة إعلانية متنكرة في هيئة تحرير. الإدراجات معلّمة، والقارئ يميّز الإدراج من المقال.',
            'يدفع المكان لفاردينيا عمولة على ما ينفقه كل ضيف يحجز عبر فاردينيا ويحضر، كما هو محدّد في الاتفاق الذي يوقّعه. لا يُحتسب شيء إذا لم يحضر الضيف أو ألغى، والضيف يدفع للمكان سعره المعتاد.',
            'ولا يُشترى الإدراج ليوضع في مكان لا ينتمي إليه. المطعم تحت المأكولات والمشروبات سواء دفع أكثر من جاره أو لم يدفع.',
          ],
          fr: [
            "Ce n'est pas un espace publicitaire déguisé en contenu éditorial. Les fiches sont signalées, et un lecteur distingue une fiche d'un article.",
            "L'établissement verse à Vardenia une commission sur ce que dépense chaque client qui réserve par Vardenia et se présente, comme le prévoit l'accord qu'il signe. Rien n'est facturé pour un client absent ou une annulation, et le client paie à l'établissement son prix habituel.",
            "Une fiche ne s'achète pas une place qui n'est pas la sienne. Un restaurant figure dans Manger & Boire, qu'il paie plus que son voisin ou non.",
          ],
          es: [
            'No es un espacio publicitario disfrazado de contenido editorial. Las fichas están señaladas, y un lector distingue una ficha de un artículo.',
            'El local paga a Vardenia una comisión sobre lo que gasta cada cliente que reserva a través de Vardenia y acude, según el acuerdo que firma. No se cobra nada por una ausencia ni por una cancelación, y el cliente paga al local su precio habitual.',
            'Una ficha no puede comprar un sitio que no le corresponde. Un restaurante está en Comer y beber, pague o no más que el de al lado.',
          ],
          pt: [
            'Não é um espaço publicitário disfarçado de conteúdo editorial. As fichas são identificadas, e o leitor sabe distinguir uma ficha de um artigo.',
            'O estabelecimento paga à Vardenia uma comissão sobre o que gasta cada cliente que reserva através da Vardenia e comparece, conforme o acordo que assina. Nada é cobrado por uma ausência ou um cancelamento, e o cliente paga ao estabelecimento o preço de sempre.',
            'Uma ficha não compra um lugar ao qual não pertence. Um restaurante fica em Comer e beber, pague ele mais ou não do que o vizinho.',
          ],
          ru: [
            'Это не рекламное место под видом редакционного материала. Карточки помечены, и читатель отличит карточку от статьи.',
            'Заведение платит Vardenia комиссию с суммы, которую потратил каждый гость, забронировавший через Vardenia и пришедший, как указано в договоре, который оно подписывает. За неявку или отмену ничего не взимается, а гость платит заведению его обычную цену.',
            'Карточку нельзя купить в раздел, которому она не принадлежит. Ресторан находится в разделе «Еда и напитки», платит он больше соседа или нет.',
          ],
          zh: [
            '它不是伪装成编辑内容的广告位。收录条目都有标注，读者能分清哪是商户条目、哪是文章。',
            '每位通过 Vardenia 预订并实际到店的客人，商户按其消费金额向 Vardenia 支付佣金，具体写在商户签署的协议中。客人未到或取消不收取任何费用，客人向商户支付的仍是其正常价格。',
            '收录不能花钱买到不属于它的位置。一家餐厅就在“餐饮”栏目里，无论它是否比隔壁付得更多。',
          ],
          hi: [
            'यह संपादकीय के भेस में कोई विज्ञापन स्लॉट नहीं है। लिस्टिंग पर निशान होता है, और पाठक लिस्टिंग और लेख में फ़र्क़ कर सकता है।',
            'Vardenia के ज़रिए बुक करके आने वाले हर मेहमान के ख़र्च पर व्यवसाय Vardenia को कमीशन देता है, जैसा कि उसके हस्ताक्षर किए समझौते में लिखा होता है। मेहमान के न आने या रद्द करने पर कुछ नहीं लिया जाता, और मेहमान व्यवसाय को उसकी सामान्य क़ीमत ही देता है।',
            'पैसे देकर लिस्टिंग को ऐसी जगह नहीं रखवाया जा सकता जहाँ वह नहीं बैठती। रेस्तराँ खाना-पीना में ही रहेगा, चाहे वह पड़ोसी से ज़्यादा पैसे दे या न दे।',
          ],
          bn: [
            'এটি সম্পাদকীয়র ছদ্মবেশে কোনো বিজ্ঞাপনের জায়গা নয়। লিস্টিং চিহ্নিত থাকে, আর পাঠক লিস্টিং ও প্রবন্ধের পার্থক্য বুঝতে পারেন।',
            'Vardenia-র মাধ্যমে বুক করে যে অতিথি আসেন, তাঁদের প্রত্যেকের খরচের ওপর ব্যবসাটি Vardenia-কে একটি কমিশন দেয়, যা ব্যবসার স্বাক্ষর করা চুক্তিতে লেখা থাকে। অতিথি না এলে বা বাতিল করলে কিছু নেওয়া হয় না, আর অতিথি ব্যবসাটিকে তার স্বাভাবিক দামই দেন।',
            'টাকা দিয়ে কোনো লিস্টিংকে এমন জায়গায় বসানো যায় না যেখানে তার থাকার কথা নয়। একটি রেস্তোরাঁ খাওয়া-দাওয়া বিভাগেই থাকবে, পাশেরটির চেয়ে বেশি টাকা দিক বা না দিক।',
          ],
          ur: [
            'یہ ادارتی مواد کے بھیس میں کوئی اشتہاری جگہ نہیں۔ لسٹنگز پر نشان ہوتا ہے، اور قاری لسٹنگ اور مضمون میں فرق کر سکتا ہے۔',
            'Vardenia کے ذریعے بکنگ کر کے آنے والے ہر مہمان کے خرچ پر کاروبار Vardenia کو کمیشن دیتا ہے، جیسا کہ اس معاہدے میں لکھا ہوتا ہے جس پر کاروبار دستخط کرتا ہے۔ مہمان کے نہ آنے یا منسوخی پر کچھ نہیں لیا جاتا، اور مہمان کاروبار کو اس کی معمول کی قیمت ہی دیتا ہے۔',
            'پیسے دے کر کسی لسٹنگ کو ایسی جگہ نہیں رکھوایا جا سکتا جہاں اس کا تعلق نہ ہو۔ ریستوران کھانا پینا ہی میں رہے گا، چاہے وہ پڑوسی سے زیادہ ادا کرے یا نہیں۔',
          ],
        }),
      },
      {
        /**
         * What each level includes, and no prices: prices are only in the rate
         * card PDF, never on the site (owner's rule). Matches core/tiers and the
         * terms: bronze is the website, silver adds the magazine page and its
         * QR code, gold adds first place and the home page band.
         */
        heading: pick(locale, {
          en: 'What each level includes',
          ar: 'ما يشمله كل مستوى',
          fr: 'Ce que comprend chaque niveau',
          es: 'Qué incluye cada nivel',
          pt: 'O que inclui cada nível',
          ru: 'Что входит в каждый уровень',
          zh: '各级别包含的内容',
          hi: 'हर स्तर में क्या शामिल है',
          bn: 'প্রতিটি স্তরে কী থাকে',
          ur: 'ہر سطح میں کیا شامل ہے',
        }),
        body: [
          ...pick(locale, {
            en: [
              '- **Bronze**: a listing on the website, in its section and in search.',
              '- **Silver**: everything in bronze, plus a page in the printed magazine with its own QR code, and a place above every bronze listing.',
              '- **Gold**: everything in silver, plus first place in every list and a place in the band at the top of the home page. Gold places are limited.',
              'Prices are in our rate card. Write to us and we will send it.',
            ],
            ar: [
              '- **البرونزي**: إدراج على الموقع، في قسمه وفي البحث.',
              '- **الفضي**: كل ما في البرونزي، مع صفحة في المجلة المطبوعة برمز QR خاص بها، ومكان قبل كل الإدراجات البرونزية.',
              '- **الذهبي**: كل ما في الفضي، مع المرتبة الأولى في كل قائمة ومكان في الشريط أعلى الصفحة الرئيسية. الأماكن الذهبية محدودة.',
              'الأسعار في لائحة الأسعار لدينا. راسلنا وسنرسلها إليك.',
            ],
            fr: [
              '- **Bronze** : une fiche sur le site, dans sa rubrique et dans la recherche.',
              '- **Argent** : tout ce que comprend le bronze, plus une page dans le magazine imprimé avec son propre code QR, et une place devant toutes les fiches bronze.',
              "- **Or** : tout ce que comprend l'argent, plus la première place dans chaque liste et une place dans le bandeau en haut de la page d'accueil. Les places or sont limitées.",
              'Les prix figurent dans notre grille tarifaire. Écrivez-nous et nous vous l’enverrons.',
            ],
            es: [
              '- **Bronce**: una ficha en el sitio web, en su sección y en la búsqueda.',
              '- **Plata**: todo lo del bronce, más una página en la revista impresa con su propio código QR, y un lugar por delante de todas las fichas de bronce.',
              '- **Oro**: todo lo de la plata, más el primer lugar en cada lista y un lugar en la franja de la parte superior de la página de inicio. Las plazas de oro son limitadas.',
              'Los precios están en nuestra tarifa. Escríbenos y te la enviamos.',
            ],
            pt: [
              '- **Bronze**: uma ficha no site, na sua secção e na pesquisa.',
              '- **Prata**: tudo o que o bronze inclui, mais uma página na revista impressa com o seu próprio código QR, e um lugar à frente de todas as fichas bronze.',
              '- **Ouro**: tudo o que a prata inclui, mais o primeiro lugar em cada lista e um lugar na faixa no topo da página inicial. Os lugares ouro são limitados.',
              'Os preços estão na nossa tabela de preços. Escreva-nos e enviamo-la.',
            ],
            ru: [
              '- **Бронза**: карточка на сайте, в своём разделе и в поиске.',
              '- **Серебро**: всё, что входит в бронзу, плюс страница в печатном журнале со своим QR-кодом и место выше всех бронзовых карточек.',
              '- **Золото**: всё, что входит в серебро, плюс первое место в каждом списке и место в полосе вверху главной страницы. Число золотых мест ограничено.',
              'Цены указаны в нашем прайс-листе. Напишите нам, и мы его пришлём.',
            ],
            zh: [
              '- **铜级**：网站上的收录条目，出现在所属栏目和搜索中。',
              '- **银级**：包含铜级的全部内容，另加印刷版杂志中的一页及其专属二维码，并排在所有铜级条目之前。',
              '- **金级**：包含银级的全部内容，另加每个列表中的首位，以及首页顶部横幅中的一个位置。金级名额有限。',
              '价格见我们的价目表。写信给我们，我们会发给您。',
            ],
            hi: [
              '- **ब्रॉन्ज़**: वेबसाइट पर एक लिस्टिंग, अपने सेक्शन में और खोज में।',
              '- **सिल्वर**: ब्रॉन्ज़ की हर चीज़, साथ में छपी पत्रिका में एक पेज और उसका अपना QR कोड, और हर ब्रॉन्ज़ लिस्टिंग से ऊपर जगह।',
              '- **गोल्ड**: सिल्वर की हर चीज़, साथ में हर सूची में पहला स्थान और होम पेज के ऊपर की पट्टी में जगह। गोल्ड जगहें सीमित हैं।',
              'क़ीमतें हमारे रेट कार्ड में हैं। हमें लिखें, हम उसे भेज देंगे।',
            ],
            bn: [
              '- **ব্রোঞ্জ**: ওয়েবসাইটে একটি লিস্টিং, নিজের বিভাগে ও সার্চে।',
              '- **সিলভার**: ব্রোঞ্জের সবকিছু, সঙ্গে ছাপা ম্যাগাজিনে একটি পাতা ও তার নিজস্ব QR কোড, আর সব ব্রোঞ্জ লিস্টিংয়ের আগে জায়গা।',
              '- **গোল্ড**: সিলভারের সবকিছু, সঙ্গে প্রতিটি তালিকায় প্রথম স্থান আর হোম পেজের ওপরের ব্যান্ডে একটি জায়গা। গোল্ড জায়গা সীমিত।',
              'দাম আমাদের রেট কার্ডে আছে। আমাদের লিখুন, আমরা পাঠিয়ে দেব।',
            ],
            ur: [
              '- **برونز**: ویب سائٹ پر ایک لسٹنگ، اپنے سیکشن اور تلاش میں۔',
              '- **سلور**: برونز کی ہر چیز، ساتھ میں چھپے ہوئے میگزین میں ایک صفحہ اور اس کا اپنا QR کوڈ، اور ہر برونز لسٹنگ سے اوپر جگہ۔',
              '- **گولڈ**: سلور کی ہر چیز، ساتھ میں ہر فہرست میں پہلا مقام اور ہوم پیج کے اوپر والی پٹی میں جگہ۔ گولڈ جگہیں محدود ہیں۔',
              'قیمتیں ہمارے ریٹ کارڈ میں ہیں۔ ہمیں لکھیں، ہم آپ کو بھیج دیں گے۔',
            ],
          }),
          /**
           * Answered by the owner on 9 November 2026: the length varies by
           * venue, a venue may renew, and a new issue is printed every year.
           * No deadline is published, because each issue sets its own.
           */
          ...pick(locale, {
            en: [
              'Contract length varies, and is agreed with each venue. When it ends, the venue can renew.',
              'A new issue of the magazine is printed every year, and we will give you the deadline for the next one.',
            ],
            ar: [
              'تختلف مدة العقد ويُتّفق عليها مع كل مكان. وعند انتهائها، يمكن للمكان أن يجدّده.',
              'يُطبع عدد جديد من المجلة كل عام، وسنعطيك الموعد النهائي للعدد التالي.',
            ],
            fr: [
              "La durée du contrat varie et se convient avec chaque établissement. À son terme, l'établissement peut le renouveler.",
              'Un nouveau numéro du magazine est imprimé chaque année, et nous vous donnerons la date limite pour le prochain.',
            ],
            es: [
              'La duración del contrato varía y se acuerda con cada local. Cuando termina, el local puede renovarlo.',
              'Cada año se imprime un nuevo número de la revista, y te daremos la fecha límite del siguiente.',
            ],
            pt: [
              'A duração do contrato varia e é combinada com cada estabelecimento. Quando termina, o estabelecimento pode renová-lo.',
              'Todos os anos é impressa uma nova edição da revista, e daremos a você o prazo da próxima.',
            ],
            ru: [
              'Срок договора бывает разным и согласуется с каждым заведением. Когда он заканчивается, заведение может его продлить.',
              'Новый номер журнала выходит каждый год, и мы сообщим вам крайний срок для следующего.',
            ],
            zh: [
              '合同期限不一，与每家商户单独商定。到期后，商户可以续约。',
              '杂志每年印刷一期新刊，我们会告诉您下一期的截稿日期。',
            ],
            hi: [
              'अनुबंध की अवधि अलग-अलग होती है और हर व्यवसाय के साथ तय की जाती है। अवधि पूरी होने पर व्यवसाय उसे नवीनीकृत कर सकता है।',
              'पत्रिका का नया अंक हर साल छपता है, और हम आपको अगले अंक की अंतिम तिथि बता देंगे।',
            ],
            bn: [
              'চুক্তির মেয়াদ ভিন্ন হতে পারে এবং প্রতিটি ব্যবসার সঙ্গে ঠিক করা হয়। মেয়াদ শেষ হলে ব্যবসাটি তা নবায়ন করতে পারে।',
              'প্রতি বছর ম্যাগাজিনের একটি নতুন সংখ্যা ছাপা হয়, আর আমরা আপনাকে পরের সংখ্যার শেষ তারিখ জানিয়ে দেব।',
            ],
            ur: [
              'معاہدے کی مدت مختلف ہوتی ہے اور ہر کاروبار کے ساتھ طے کی جاتی ہے۔ مدت ختم ہونے پر کاروبار اس کی تجدید کر سکتا ہے۔',
              'میگزین کا نیا شمارہ ہر سال چھپتا ہے، اور ہم آپ کو اگلے شمارے کی آخری تاریخ بتا دیں گے۔',
            ],
          }),
        ],
      },
      {
        heading: pick(locale, {
          en: 'How to start',
          ar: 'كيف تبدأ',
          fr: 'Comment commencer',
          es: 'Cómo empezar',
          pt: 'Como começar',
          ru: 'С чего начать',
          zh: '如何开始',
          hi: 'शुरुआत कैसे करें',
          bn: 'কীভাবে শুরু করবেন',
          ur: 'آغاز کیسے کریں',
        }),
        body: [
          pick(locale, {
            en: 'Send us the business name, where it is, and a sentence about it. We will come back to you about whether it is right for the directory and what it would involve.',
            ar: 'أرسل لنا اسم العمل وأين هو وجملة عنه. سنعود إليك بما إذا كان مناسباً للدليل وبما يعنيه ذلك.',
            fr: "Envoyez-nous le nom de l'établissement, où il se trouve et une phrase à son sujet. Nous reviendrons vers vous pour vous dire s'il a sa place dans l'annuaire et ce que cela impliquerait.",
            es: 'Envíanos el nombre del negocio, dónde está y una frase sobre él. Te responderemos si encaja en el directorio y qué implicaría.',
            pt: 'Mande o nome do negócio, onde fica e uma frase sobre ele. Voltaremos a falar com você sobre se ele combina com o diretório e o que isso envolveria.',
            ru: 'Пришлите нам название заведения, где оно находится, и пару слов о нём. Мы ответим, подходит ли оно для справочника и что для этого потребуется.',
            zh: '请把商户名称、所在位置以及一句简介发给我们。我们会告诉您它是否适合收录进指南，以及需要做些什么。',
            hi: 'हमें व्यवसाय का नाम, वह कहाँ है और उसके बारे में एक वाक्य भेजें। हम आपको बताएँगे कि वह निर्देशिका के लिए ठीक है या नहीं और इसमें क्या-क्या शामिल होगा।',
            bn: 'ব্যবসার নাম, কোথায় অবস্থিত আর সেটি সম্পর্কে একটি বাক্য আমাদের পাঠান। ডিরেক্টরির জন্য সেটি উপযুক্ত কি না এবং তাতে কী কী লাগবে, আমরা আপনাকে জানাব।',
            ur: 'ہمیں کاروبار کا نام، وہ کہاں ہے اور اس کے بارے میں ایک جملہ بھیجیں۔ ہم آپ کو بتائیں گے کہ آیا وہ ڈائریکٹری کے لیے موزوں ہے اور اس میں کیا کچھ شامل ہو گا۔',
          }),
          contactEmail(locale),
          pick(locale, {
            en: 'Or see **Add your business** for what to send.',
            ar: 'أو انظر **أضف عملك** لتعرف ما ترسله.',
            fr: 'Ou voyez **Ajouter votre établissement** pour savoir quoi envoyer.',
            es: 'O consulta **Añade tu negocio** para saber qué enviar.',
            pt: 'Ou veja **Adicione seu negócio** para saber o que enviar.',
            ru: 'Или см. **Добавить своё заведение**, чтобы узнать, что прислать.',
            zh: '或者查看**添加您的商户**，了解需要发送哪些信息。',
            hi: 'या क्या भेजना है, यह जानने के लिए देखें **अपना व्यवसाय जोड़ें**।',
            bn: 'অথবা কী পাঠাতে হবে জানতে দেখুন **আপনার ব্যবসা যোগ করুন**।',
            ur: 'یا کیا بھیجنا ہے یہ جاننے کے لیے دیکھیں **اپنا کاروبار شامل کریں**۔',
          }),
        ],
      },
    ],
  }
}

// ------------------------------------------------------------------ advertise

export function advertisePage(locale: Locale = 'en'): ContentPage {
  return {
    title: pick(locale, {
      en: 'Advertise with us',
      ar: 'أعلن معنا',
      fr: 'Annoncez chez nous',
      es: 'Anúnciate con nosotros',
      pt: 'Anuncie conosco',
      ru: 'Реклама у нас',
      zh: '在我们这里投放广告',
      hi: 'हमारे साथ विज्ञापन दें',
      bn: 'আমাদের সাথে বিজ্ঞাপন দিন',
      ur: 'ہمارے ساتھ اشتہار دیں',
    }),
    intro: pick(locale, {
      en: 'Advertising in Vardenia is separate from being listed. A listing describes a place; an advertisement is space in the magazine.',
      ar: 'الإعلان في فاردينيا شيء والإدراج شيء آخر. الإدراج يصف مكاناً، والإعلان مساحة في المجلة.',
      fr: 'Faire de la publicité dans Vardenia et y être référencé sont deux choses distinctes. Une fiche décrit un lieu ; une publicité est un espace dans le magazine.',
      es: 'Anunciarse en Vardenia es algo distinto de estar en el directorio. Una ficha describe un lugar; un anuncio es un espacio en la revista.',
      pt: 'Anunciar na Vardenia é diferente de estar no diretório. Uma ficha descreve um lugar; um anúncio é um espaço na revista.',
      ru: 'Реклама в Vardenia — это отдельно от карточки в справочнике. Карточка описывает место; реклама — это место в журнале.',
      zh: '在 Vardenia 投放广告与被收录是两回事。收录条目介绍一个地点；广告则是杂志上的一块版面。',
      hi: 'Vardenia में विज्ञापन देना और लिस्ट होना दो अलग बातें हैं। लिस्टिंग किसी जगह के बारे में बताती है; विज्ञापन पत्रिका में ली गई जगह है।',
      bn: 'Vardenia-তে বিজ্ঞাপন দেওয়া আর লিস্টিংয়ে থাকা আলাদা ব্যাপার। লিস্টিং একটি জায়গার বর্ণনা দেয়; বিজ্ঞাপন হলো ম্যাগাজিনের একটি জায়গা।',
      ur: 'Vardenia میں اشتہار دینا اور لسٹ ہونا الگ الگ باتیں ہیں۔ لسٹنگ کسی مقام کی تفصیل ہے؛ اشتہار میگزین میں ایک جگہ ہے۔',
    }),
    sections: [
      {
        heading: pick(locale, {
          en: 'Who reads it',
          ar: 'من يقرأها',
          fr: 'Qui le lit',
          es: 'Quién la lee',
          pt: 'Quem lê',
          ru: 'Кто его читает',
          zh: '谁在读',
          hi: 'इसे कौन पढ़ता है',
          bn: 'কারা পড়েন',
          ur: 'اسے کون پڑھتا ہے',
        }),
        body: [
          TBD('the print run, where issues are distributed, and who picks them up'),
          TBD('the audience, in whatever terms we can actually support with evidence'),
        ],
      },
      {
        heading: pick(locale, {
          en: 'What is available',
          ar: 'المتاح',
          fr: 'Ce qui est proposé',
          es: 'Qué hay disponible',
          pt: 'O que está disponível',
          ru: 'Что доступно',
          zh: '可选项目',
          hi: 'क्या उपलब्ध है',
          bn: 'কী কী পাওয়া যায়',
          ur: 'کیا دستیاب ہے',
        }),
        body: [
          TBD('the ad formats and sizes (prices stay in the rate card, never on the site)'),
          TBD('artwork specifications and the deadline for supplying them'),
          TBD('whether we offer any placement on the website, and if so what'),
        ],
      },
      {
        heading: pick(locale, {
          en: 'What we will not do',
          ar: 'ما لن نفعله',
          fr: 'Ce que nous ne ferons pas',
          es: 'Lo que no haremos',
          pt: 'O que não faremos',
          ru: 'Чего мы делать не будем',
          zh: '我们不会做的事',
          hi: 'हम क्या नहीं करेंगे',
          bn: 'আমরা যা করব না',
          ur: 'ہم کیا نہیں کریں گے',
        }),
        body: pick(locale, {
          en: [
            'Advertising is marked as advertising. We do not write an article about a business because it bought a page, and we do not let an advertiser choose what the editorial says.',
            'That rule costs us money occasionally and it is the reason the magazine is worth reading.',
          ],
          ar: [
            'الإعلان معلّم كإعلان. لا نكتب مقالاً عن عمل لأنه اشترى صفحة، ولا نترك المعلن يقرر ما يقوله التحرير.',
            'هذه القاعدة تكلفنا مالاً أحياناً، وهي سبب كون المجلة تستحق القراءة.',
          ],
          fr: [
            "La publicité est signalée comme telle. Nous n'écrivons pas d'article sur un établissement parce qu'il a acheté une page, et nous ne laissons pas un annonceur décider de ce que dit la rédaction.",
            "Cette règle nous coûte parfois de l'argent, et c'est pour cela que le magazine vaut la peine d'être lu.",
          ],
          es: [
            'La publicidad se señala como publicidad. No escribimos un artículo sobre un negocio porque haya comprado una página, ni dejamos que un anunciante decida lo que dice la redacción.',
            'Esa norma nos cuesta dinero de vez en cuando, y es la razón por la que la revista merece la pena.',
          ],
          pt: [
            'Publicidade é identificada como publicidade. Não escrevemos um artigo sobre um negócio porque ele comprou uma página, e não deixamos um anunciante escolher o que a redação diz.',
            'Essa regra às vezes nos custa dinheiro, e é o motivo de a revista valer a leitura.',
          ],
          ru: [
            'Реклама помечена как реклама. Мы не пишем статью о заведении потому, что оно купило полосу, и не позволяем рекламодателю решать, что говорит редакция.',
            'Иногда это правило стоит нам денег — и именно поэтому журнал стоит читать.',
          ],
          zh: [
            '广告都会标明是广告。我们不会因为某个商户买了一个版面就为它写文章，也不会让广告主左右编辑内容。',
            '这条规矩有时会让我们少赚些钱，但正是它让这本杂志值得一读。',
          ],
          hi: [
            'विज्ञापन पर विज्ञापन का निशान होता है। हम किसी व्यवसाय पर इसलिए लेख नहीं लिखते कि उसने एक पन्ना ख़रीदा, और न ही किसी विज्ञापनदाता को यह तय करने देते हैं कि संपादकीय क्या कहे।',
            'यह नियम कभी-कभी हमें पैसे का नुक़सान कराता है, और इसी वजह से पत्रिका पढ़ने लायक़ है।',
          ],
          bn: [
            'বিজ্ঞাপনকে বিজ্ঞাপন হিসেবেই চিহ্নিত করা হয়। কোনো ব্যবসা একটি পাতা কিনেছে বলে আমরা তাদের নিয়ে প্রবন্ধ লিখি না, আর কোনো বিজ্ঞাপনদাতাকে ঠিক করতে দিই না সম্পাদকীয় কী বলবে।',
            'এই নিয়মে মাঝে মাঝে আমাদের টাকা হারাতে হয়, আর এ কারণেই ম্যাগাজিনটি পড়ার মতো।',
          ],
          ur: [
            'اشتہار پر اشتہار کا نشان ہوتا ہے۔ ہم کسی کاروبار پر اس لیے مضمون نہیں لکھتے کہ اس نے ایک صفحہ خریدا، اور نہ ہی کسی مشتہر کو یہ طے کرنے دیتے ہیں کہ اداریہ کیا کہے۔',
            'یہ اصول کبھی کبھی ہمیں مالی نقصان دیتا ہے، اور یہی وجہ ہے کہ میگزین پڑھنے کے لائق ہے۔',
          ],
        }),
      },
      {
        heading: pick(locale, {
          en: 'Get in touch',
          ar: 'تواصل معنا',
          fr: 'Nous contacter',
          es: 'Contáctanos',
          pt: 'Fale conosco',
          ru: 'Свяжитесь с нами',
          zh: '联系我们',
          hi: 'संपर्क करें',
          bn: 'যোগাযোগ করুন',
          ur: 'رابطہ کریں',
        }),
        body: [
          pick(locale, {
            en: 'Tell us what you have in mind and we will send the current rates.',
            ar: 'أخبرنا بما في بالك ونرسل لك الأسعار الحالية.',
            fr: 'Dites-nous ce que vous avez en tête et nous vous enverrons les tarifs en vigueur.',
            es: 'Cuéntanos qué tienes en mente y te enviaremos las tarifas vigentes.',
            pt: 'Conte o que você tem em mente e enviaremos os preços atuais.',
            ru: 'Расскажите, что вы задумали, и мы пришлём действующие расценки.',
            zh: '告诉我们您的想法，我们会把最新的价格发给您。',
            hi: 'बताइए आपके मन में क्या है, और हम मौजूदा दरें भेज देंगे।',
            bn: 'আপনার ভাবনা আমাদের জানান, আমরা বর্তমান রেট পাঠিয়ে দেব।',
            ur: 'بتائیں آپ کے ذہن میں کیا ہے، اور ہم موجودہ نرخ بھیج دیں گے۔',
          }),
          contactEmail(locale),
        ],
      },
    ],
  }
}

// ----------------------------------------------------- add your business

/**
 * The owner's text of 11 November 2026, "Introduce Your Business", replacing
 * the earlier what-to-send page. The seven things to send are subsections, in
 * the owner's order. A line starting "> " is a pull quote and "~ " the closing
 * Vardenia signature (ContentPage). The one line added to the owner's text is
 * the address to write to, so the page says where to send it all.
 */
export function addYourBusinessPage(locale: Locale = 'en'): ContentPage {
  const steps: [string, string][] = pick(locale, {
    en: [
      ['Business Name & Location', 'Your business name, region, and full address.'],
      [
        'Business Category',
        'Tell us about your business, whether it is a hotel, guesthouse, restaurant, café, attraction, activity provider, or another tourism-related service.',
      ],
      [
        'About Your Business',
        'A brief introduction highlighting what makes your destination, services, or experiences unique.',
      ],
      [
        'Website & Social Media',
        'Share your official website and social media pages, if available.',
      ],
      [
        'Photos & Visual Content',
        'A selection of high-quality photographs that showcase your property, services, or experiences.',
      ],
      [
        'Contact Information',
        'Provide the name, phone number, and email address of your business representative.',
      ],
      [
        'Booking Preferences',
        'Let us know whether you are interested in receiving booking inquiries through Vardenia or prefer customers to contact you directly.',
      ],
    ],
    ar: [
      ['اسم العمل وموقعه', 'اسم عملك والمنطقة والعنوان الكامل.'],
      [
        'فئة العمل',
        'أخبرنا عن عملك، سواء كان فندقاً أو بيت ضيافة أو مطعماً أو مقهى أو معلماً سياحياً أو مقدّم أنشطة أو خدمة سياحية أخرى.',
      ],
      ['نبذة عن عملك', 'تعريف موجز يُبرز ما يميّز وجهتك أو خدماتك أو تجاربك.'],
      [
        'الموقع الإلكتروني ومواقع التواصل',
        'شاركنا موقعك الرسمي وصفحاتك على مواقع التواصل الاجتماعي، إن وُجدت.',
      ],
      ['الصور والمحتوى المرئي', 'مجموعة من الصور عالية الجودة تُظهر منشأتك أو خدماتك أو تجاربك.'],
      ['معلومات الاتصال', 'اسم ممثّل عملك ورقم هاتفه وبريده الإلكتروني.'],
      [
        'تفضيلات الحجز',
        'أخبرنا إن كنت ترغب في تلقّي طلبات الحجز عبر فاردينيا، أو تفضّل أن يتواصل معك العملاء مباشرة.',
      ],
    ],
    fr: [
      [
        'Nom et adresse de l’établissement',
        'Le nom de votre établissement, sa région et son adresse complète.',
      ],
      [
        'Catégorie',
        'Dites-nous ce qu’est votre établissement : hôtel, maison d’hôtes, restaurant, café, site à visiter, prestataire d’activités ou autre service touristique.',
      ],
      [
        'À propos de votre établissement',
        'Une courte présentation de ce qui rend votre destination, vos services ou vos expériences uniques.',
      ],
      [
        'Site web et réseaux sociaux',
        'Votre site officiel et vos pages sur les réseaux sociaux, s’il y en a.',
      ],
      [
        'Photos et contenus visuels',
        'Une sélection de photographies de grande qualité qui mettent en valeur votre établissement, vos services ou vos expériences.',
      ],
      [
        'Coordonnées',
        'Le nom, le numéro de téléphone et l’adresse e-mail de la personne qui représente votre établissement.',
      ],
      [
        'Préférences de réservation',
        'Dites-nous si vous souhaitez recevoir des demandes de réservation via Vardenia ou si vous préférez que les clients vous contactent directement.',
      ],
    ],
    es: [
      [
        'Nombre y ubicación del negocio',
        'El nombre de tu negocio, la región y la dirección completa.',
      ],
      [
        'Categoría del negocio',
        'Cuéntanos qué es tu negocio: un hotel, una casa de huéspedes, un restaurante, un café, una atracción, un proveedor de actividades u otro servicio turístico.',
      ],
      [
        'Sobre tu negocio',
        'Una breve presentación que destaque lo que hace único a tu destino, tus servicios o tus experiencias.',
      ],
      [
        'Web y redes sociales',
        'Comparte tu web oficial y tus perfiles en redes sociales, si los tienes.',
      ],
      [
        'Fotos y contenido visual',
        'Una selección de fotografías de alta calidad que muestren tu establecimiento, tus servicios o tus experiencias.',
      ],
      [
        'Datos de contacto',
        'El nombre, el teléfono y el correo electrónico de la persona que representa a tu negocio.',
      ],
      [
        'Preferencias de reserva',
        'Dinos si te interesa recibir solicitudes de reserva a través de Vardenia o prefieres que los clientes te contacten directamente.',
      ],
    ],
    pt: [
      ['Nome e localização do negócio', 'O nome do seu negócio, a região e o endereço completo.'],
      [
        'Categoria do negócio',
        'Conte-nos sobre o seu negócio: se é um hotel, uma pousada, um restaurante, um café, uma atração, um prestador de atividades ou outro serviço turístico.',
      ],
      [
        'Sobre o seu negócio',
        'Uma breve apresentação destacando o que torna únicos o seu destino, os seus serviços ou as suas experiências.',
      ],
      [
        'Site e redes sociais',
        'Compartilhe seu site oficial e suas páginas nas redes sociais, se houver.',
      ],
      [
        'Fotos e conteúdo visual',
        'Uma seleção de fotografias de alta qualidade que mostrem seu espaço, seus serviços ou suas experiências.',
      ],
      ['Informações de contato', 'O nome, o telefone e o e-mail do representante do seu negócio.'],
      [
        'Preferências de reserva',
        'Diga-nos se você tem interesse em receber pedidos de reserva pela Vardenia ou se prefere que os clientes entrem em contato diretamente com você.',
      ],
    ],
    ru: [
      ['Название и адрес', 'Название вашего заведения, регион и полный адрес.'],
      [
        'Категория',
        'Расскажите, что у вас за заведение: отель, гостевой дом, ресторан, кафе, достопримечательность, организатор досуга или другая туристическая услуга.',
      ],
      [
        'О вашем заведении',
        'Краткий рассказ о том, что делает ваше место, услуги или впечатления особенными.',
      ],
      [
        'Сайт и соцсети',
        'Ссылки на ваш официальный сайт и страницы в социальных сетях, если они есть.',
      ],
      [
        'Фотографии и визуальные материалы',
        'Подборка качественных фотографий, которые показывают ваше заведение, услуги или впечатления.',
      ],
      [
        'Контактные данные',
        'Имя, номер телефона и адрес электронной почты представителя вашего заведения.',
      ],
      [
        'Бронирования',
        'Сообщите, хотите ли вы получать запросы на бронирование через Vardenia или предпочитаете, чтобы клиенты связывались с вами напрямую.',
      ],
    ],
    zh: [
      ['商户名称与位置', '您的商户名称、所在地区及详细地址。'],
      [
        '商户类别',
        '告诉我们您的商户类型：酒店、民宿、餐厅、咖啡馆、景点、活动服务商，或其他旅游相关服务。',
      ],
      ['商户简介', '简要介绍您的目的地、服务或体验有何独特之处。'],
      ['网站与社交媒体', '如有，请提供您的官方网站和社交媒体主页。'],
      ['照片与视觉内容', '精选几张高质量照片，展示您的场所、服务或体验。'],
      ['联系方式', '商户代表的姓名、电话号码和电子邮箱。'],
      ['预订偏好', '请告诉我们，您希望通过 Vardenia 接收预订咨询，还是更希望客人直接联系您。'],
    ],
    hi: [
      ['व्यवसाय का नाम और स्थान', 'आपके व्यवसाय का नाम, क्षेत्र और पूरा पता।'],
      [
        'व्यवसाय की श्रेणी',
        'हमें अपने व्यवसाय के बारे में बताएँ, चाहे वह होटल हो, गेस्टहाउस, रेस्तराँ, कैफ़े, दर्शनीय स्थल, गतिविधि प्रदाता या कोई और पर्यटन सेवा।',
      ],
      [
        'आपके व्यवसाय के बारे में',
        'एक छोटा परिचय, जो बताए कि आपकी जगह, सेवाएँ या अनुभव किस बात में अनोखे हैं।',
      ],
      ['वेबसाइट और सोशल मीडिया', 'अगर हों, तो अपनी आधिकारिक वेबसाइट और सोशल मीडिया पेज साझा करें।'],
      [
        'तस्वीरें और विज़ुअल सामग्री',
        'उच्च गुणवत्ता वाली कुछ चुनिंदा तस्वीरें, जो आपकी जगह, सेवाएँ या अनुभव दिखाएँ।',
      ],
      ['संपर्क जानकारी', 'आपके व्यवसाय के प्रतिनिधि का नाम, फ़ोन नंबर और ईमेल पता।'],
      [
        'बुकिंग की पसंद',
        'हमें बताएँ कि आप Vardenia के ज़रिए बुकिंग अनुरोध पाना चाहते हैं या चाहते हैं कि ग्राहक सीधे आपसे संपर्क करें।',
      ],
    ],
    bn: [
      ['ব্যবসার নাম ও অবস্থান', 'আপনার ব্যবসার নাম, অঞ্চল ও পূর্ণ ঠিকানা।'],
      [
        'ব্যবসার ধরন',
        'আপনার ব্যবসা সম্পর্কে বলুন: হোটেল, গেস্টহাউস, রেস্তোরাঁ, ক্যাফে, দর্শনীয় স্থান, কার্যক্রম আয়োজক বা পর্যটন-সংক্রান্ত অন্য কোনো সেবা।',
      ],
      [
        'আপনার ব্যবসা সম্পর্কে',
        'একটি সংক্ষিপ্ত পরিচিতি, যাতে বোঝা যায় আপনার গন্তব্য, সেবা বা অভিজ্ঞতাকে কী অনন্য করে তোলে।',
      ],
      ['ওয়েবসাইট ও সোশ্যাল মিডিয়া', 'আপনার অফিসিয়াল ওয়েবসাইট ও সোশ্যাল মিডিয়া পেজ, যদি থাকে।'],
      [
        'ছবি ও ভিজ্যুয়াল কনটেন্ট',
        'উচ্চমানের কিছু বাছাই করা ছবি, যা আপনার প্রতিষ্ঠান, সেবা বা অভিজ্ঞতা তুলে ধরে।',
      ],
      ['যোগাযোগের তথ্য', 'আপনার ব্যবসার প্রতিনিধির নাম, ফোন নম্বর ও ইমেল ঠিকানা।'],
      [
        'বুকিংয়ের পছন্দ',
        'আমাদের জানান, আপনি Vardenia-র মাধ্যমে বুকিংয়ের অনুরোধ পেতে চান, নাকি চান অতিথিরা সরাসরি আপনার সঙ্গে যোগাযোগ করুন।',
      ],
    ],
    ur: [
      ['کاروبار کا نام اور مقام', 'آپ کے کاروبار کا نام، علاقہ اور مکمل پتا۔'],
      [
        'کاروبار کی قسم',
        'ہمیں اپنے کاروبار کے بارے میں بتائیں، چاہے وہ ہوٹل ہو، گیسٹ ہاؤس، ریستوران، کیفے، سیاحتی مقام، سرگرمیوں کا منتظم یا سیاحت سے متعلق کوئی اور خدمت۔',
      ],
      [
        'آپ کے کاروبار کے بارے میں',
        'ایک مختصر تعارف جو بتائے کہ آپ کی منزل، خدمات یا تجربات کو کیا چیز منفرد بناتی ہے۔',
      ],
      [
        'ویب سائٹ اور سوشل میڈیا',
        'اگر ہوں تو اپنی سرکاری ویب سائٹ اور سوشل میڈیا صفحات شیئر کریں۔',
      ],
      [
        'تصاویر اور بصری مواد',
        'اعلیٰ معیار کی چند منتخب تصاویر جو آپ کی جگہ، خدمات یا تجربات دکھائیں۔',
      ],
      ['رابطے کی معلومات', 'آپ کے کاروبار کے نمائندے کا نام، فون نمبر اور ای میل پتا۔'],
      [
        'بکنگ کی ترجیحات',
        'ہمیں بتائیں کہ آپ Vardenia کے ذریعے بکنگ کی درخواستیں وصول کرنا چاہتے ہیں یا چاہتے ہیں کہ گاہک براہِ راست آپ سے رابطہ کریں۔',
      ],
    ],
  })

  return {
    title: pick(locale, {
      en: 'Introduce Your Business',
      ar: 'عرّف بعملك',
      fr: 'Présentez votre établissement',
      es: 'Presenta tu negocio',
      pt: 'Apresente seu negócio',
      ru: 'Расскажите о своём заведении',
      zh: '介绍您的商户',
      hi: 'अपने व्यवसाय का परिचय दें',
      bn: 'আপনার ব্যবসার পরিচয় দিন',
      ur: 'اپنے کاروبار کا تعارف کروائیں',
    }),
    intro: pick(locale, {
      en: 'Your Destination. Your Story. A Wider Audience.',
      ar: 'وجهتك. قصتك. جمهور أوسع.',
      fr: 'Votre destination. Votre histoire. Un public plus large.',
      es: 'Tu destino. Tu historia. Un público más amplio.',
      pt: 'Seu destino. Sua história. Um público maior.',
      ru: 'Ваше место. Ваша история. Более широкая аудитория.',
      zh: '您的目的地。您的故事。更广的受众。',
      hi: 'आपकी मंज़िल। आपकी कहानी। एक बड़ा दर्शक वर्ग।',
      bn: 'আপনার গন্তব্য। আপনার গল্প। আরও বিস্তৃত পাঠক ও অতিথি।',
      ur: 'آپ کی منزل۔ آپ کی کہانی۔ ایک وسیع تر حلقہ۔',
    }),
    sections: [
      {
        heading: pick(locale, {
          en: 'A Story Worth Sharing',
          ar: 'قصة تستحق أن تُروى',
          fr: 'Une histoire à partager',
          es: 'Una historia que contar',
          pt: 'Uma história para contar',
          ru: 'История, которой стоит поделиться',
          zh: '值得分享的故事',
          hi: 'एक कहानी जो बताने लायक है',
          bn: 'বলার মতো একটি গল্প',
          ur: 'سنانے کے لائق ایک کہانی',
        }),
        body: pick(locale, {
          en: [
            '> Every exceptional destination has a story worth sharing.',
            'At Vardenia, we welcome hotels, guesthouses, restaurants, attractions, and tourism service providers who wish to become part of our growing network across Lebanon.',
            'Whether you represent an established destination or a hidden gem waiting to be discovered, we invite you to introduce your business to our team.',
          ],
          ar: [
            '> لكلّ وجهة استثنائية قصة تستحق أن تُروى.',
            'نرحّب في فاردينيا بالفنادق وبيوت الضيافة والمطاعم والمعالم السياحية ومقدّمي الخدمات السياحية الراغبين في الانضمام إلى شبكتنا المتنامية في أنحاء لبنان.',
            'سواء كنت تمثّل وجهة عريقة أو جوهرة خفيّة تنتظر من يكتشفها، ندعوك إلى التعريف بعملك لدى فريقنا.',
          ],
          fr: [
            '> Chaque destination d’exception a une histoire qui mérite d’être partagée.',
            'Vardenia accueille les hôtels, maisons d’hôtes, restaurants, sites à visiter et prestataires touristiques qui souhaitent rejoindre notre réseau grandissant à travers le Liban.',
            'Que vous représentiez une adresse reconnue ou une perle cachée qui n’attend que d’être découverte, nous vous invitons à présenter votre établissement à notre équipe.',
          ],
          es: [
            '> Todo destino excepcional tiene una historia que merece ser contada.',
            'En Vardenia damos la bienvenida a hoteles, casas de huéspedes, restaurantes, atracciones y proveedores de servicios turísticos que deseen formar parte de nuestra creciente red en todo el Líbano.',
            'Tanto si representas un destino consolidado como una joya escondida a la espera de ser descubierta, te invitamos a presentar tu negocio a nuestro equipo.',
          ],
          pt: [
            '> Todo destino excepcional tem uma história que merece ser contada.',
            'Na Vardenia, recebemos hotéis, pousadas, restaurantes, atrações e prestadores de serviços turísticos que desejam fazer parte da nossa rede crescente em todo o Líbano.',
            'Seja você o representante de um destino consagrado ou de uma joia escondida à espera de ser descoberta, convidamos você a apresentar seu negócio à nossa equipe.',
          ],
          ru: [
            '> У каждого особенного места есть история, которой стоит поделиться.',
            'Vardenia приглашает отели, гостевые дома, рестораны, достопримечательности и поставщиков туристических услуг, которые хотят стать частью нашей растущей сети по всему Ливану.',
            'Представляете ли вы известное место или скрытую жемчужину, которая ждёт, чтобы её открыли, мы приглашаем вас рассказать о своём заведении нашей команде.',
          ],
          zh: [
            '> 每一处非凡的目的地，都有一个值得分享的故事。',
            'Vardenia 欢迎酒店、民宿、餐厅、景点及旅游服务商加入我们遍布黎巴嫩、不断壮大的网络。',
            '无论您代表的是久负盛名的目的地，还是一颗等待被发现的遗珠，我们都诚邀您向我们的团队介绍您的商户。',
          ],
          hi: [
            '> हर असाधारण मंज़िल के पास एक कहानी होती है जो बताने लायक है।',
            'Vardenia में हम उन होटलों, गेस्टहाउसों, रेस्तराँओं, दर्शनीय स्थलों और पर्यटन सेवा प्रदाताओं का स्वागत करते हैं जो पूरे लेबनान में फैले हमारे बढ़ते नेटवर्क का हिस्सा बनना चाहते हैं।',
            'चाहे आप किसी जानी-मानी जगह का प्रतिनिधित्व करते हों या किसी छिपे हुए रत्न का जो खोजे जाने की राह देख रहा है, हम आपको अपनी टीम से अपने व्यवसाय का परिचय कराने के लिए आमंत्रित करते हैं।',
          ],
          bn: [
            '> প্রতিটি অসাধারণ গন্তব্যের একটি গল্প আছে, যা সবার সঙ্গে ভাগ করে নেওয়ার মতো।',
            'Vardenia-তে আমরা সেই সব হোটেল, গেস্টহাউস, রেস্তোরাঁ, দর্শনীয় স্থান ও পর্যটন সেবাদাতাকে স্বাগত জানাই, যারা লেবানন জুড়ে আমাদের ক্রমবর্ধমান নেটওয়ার্কের অংশ হতে চান।',
            'আপনি কোনো সুপ্রতিষ্ঠিত গন্তব্যের প্রতিনিধি হোন বা আবিষ্কারের অপেক্ষায় থাকা কোনো লুকোনো রত্নের, আমাদের দলের কাছে আপনার ব্যবসার পরিচয় দিতে আমরা আপনাকে আমন্ত্রণ জানাই।',
          ],
          ur: [
            '> ہر غیر معمولی منزل کے پاس ایک ایسی کہانی ہوتی ہے جو سنانے کے لائق ہے۔',
            'Vardenia میں ہم ان ہوٹلوں، گیسٹ ہاؤسز، ریستورانوں، سیاحتی مقامات اور سیاحتی خدمات فراہم کرنے والوں کا خیرمقدم کرتے ہیں جو پورے لبنان میں پھیلے ہمارے بڑھتے ہوئے نیٹ ورک کا حصہ بننا چاہتے ہیں۔',
            'چاہے آپ کسی معروف منزل کی نمائندگی کرتے ہوں یا کسی چھپے ہوئے نگینے کی جو دریافت ہونے کا منتظر ہے، ہم آپ کو دعوت دیتے ہیں کہ اپنے کاروبار کا تعارف ہماری ٹیم سے کروائیں۔',
          ],
        }),
      },
      {
        heading: pick(locale, {
          en: 'To Get Started',
          ar: 'للبدء',
          fr: 'Pour commencer',
          es: 'Para empezar',
          pt: 'Para começar',
          ru: 'С чего начать',
          zh: '如何开始',
          hi: 'शुरुआत कैसे करें',
          bn: 'যেভাবে শুরু করবেন',
          ur: 'آغاز کیسے کریں',
        }),
        body: [
          contactEmail(locale),
          pick(locale, {
            en: 'Simply share the following information:',
            ar: 'يكفي أن ترسل إلينا المعلومات التالية:',
            fr: 'Il suffit de nous transmettre les informations suivantes :',
            es: 'Solo tienes que compartir la siguiente información:',
            pt: 'Basta compartilhar as seguintes informações:',
            ru: 'Просто пришлите нам следующую информацию:',
            zh: '只需提供以下信息：',
            hi: 'बस नीचे दी गई जानकारी हमें भेजें:',
            bn: 'শুধু নিচের তথ্যগুলো আমাদের জানান:',
            ur: 'بس درج ذیل معلومات ہمیں بھیجیں:',
          }),
        ],
        subsections: steps.map(([heading, text]) => ({ heading, body: [text] })),
      },
      {
        heading: pick(locale, {
          en: 'What Happens Next',
          ar: 'ماذا يحدث بعد ذلك',
          fr: 'Et ensuite',
          es: 'Qué pasa después',
          pt: 'O que acontece depois',
          ru: 'Что дальше',
          zh: '接下来会怎样',
          hi: 'आगे क्या होता है',
          bn: 'এরপর কী হয়',
          ur: 'اس کے بعد کیا ہوتا ہے',
        }),
        body: pick(locale, {
          en: [
            'Once we receive your information, our team will review your submission and contact you to discuss the next steps.',
            '~ Join Vardenia and become part of a platform dedicated to showcasing the richness of Lebanon.',
          ],
          ar: [
            'حين تصلنا معلوماتك، يراجع فريقنا طلبك ويتواصل معك لمناقشة الخطوات التالية.',
            '~ انضمّ إلى فاردينيا وكن جزءاً من منصّة مكرّسة لإبراز غنى لبنان.',
          ],
          fr: [
            'Dès réception de vos informations, notre équipe examinera votre demande et vous contactera pour convenir des prochaines étapes.',
            '~ Rejoignez Vardenia et prenez part à une plateforme consacrée à toute la richesse du Liban.',
          ],
          es: [
            'En cuanto recibamos tu información, nuestro equipo revisará tu solicitud y se pondrá en contacto contigo para hablar de los siguientes pasos.',
            '~ Únete a Vardenia y forma parte de una plataforma dedicada a mostrar la riqueza del Líbano.',
          ],
          pt: [
            'Assim que recebermos suas informações, nossa equipe analisará seu pedido e entrará em contato para conversar sobre os próximos passos.',
            '~ Junte-se à Vardenia e faça parte de uma plataforma dedicada a mostrar a riqueza do Líbano.',
          ],
          ru: [
            'Получив вашу информацию, наша команда рассмотрит заявку и свяжется с вами, чтобы обсудить следующие шаги.',
            '~ Присоединяйтесь к Vardenia и станьте частью платформы, которая показывает всё богатство Ливана.',
          ],
          zh: [
            '收到您的信息后，我们的团队会审核您的申请，并与您联系，商讨下一步事宜。',
            '~ 加入 Vardenia，成为一个致力于展现黎巴嫩丰富魅力的平台的一员。',
          ],
          hi: [
            'आपकी जानकारी मिलने के बाद हमारी टीम आपके आवेदन की समीक्षा करेगी और अगले क़दमों पर बात करने के लिए आपसे संपर्क करेगी।',
            '~ Vardenia से जुड़ें और लेबनान की समृद्धि को दिखाने के लिए समर्पित एक मंच का हिस्सा बनें।',
          ],
          bn: [
            'আপনার তথ্য পাওয়ার পর আমাদের দল আপনার আবেদন পর্যালোচনা করবে এবং পরবর্তী ধাপ নিয়ে আলোচনা করতে আপনার সঙ্গে যোগাযোগ করবে।',
            '~ Vardenia-তে যোগ দিন এবং লেবাননের ঐশ্বর্য তুলে ধরতে নিবেদিত একটি প্ল্যাটফর্মের অংশ হয়ে উঠুন।',
          ],
          ur: [
            'آپ کی معلومات موصول ہونے پر ہماری ٹیم آپ کی درخواست کا جائزہ لے گی اور اگلے مراحل پر بات کرنے کے لیے آپ سے رابطہ کرے گی۔',
            '~ Vardenia میں شامل ہوں اور لبنان کی رنگا رنگی کو دنیا کے سامنے لانے والے پلیٹ فارم کا حصہ بنیں۔',
          ],
        }),
      },
    ],
  }
}
