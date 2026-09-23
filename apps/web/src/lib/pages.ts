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
 * The legal documents remain English in every edition, deliberately. See
 * lib/legal - an unreviewed translation of a contract reads as authoritative
 * and is not.
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
          en: 'Why print, in 2026',
          ar: 'لماذا الطباعة، في 2026',
          fr: "Pourquoi l'imprimé, en 2026",
          es: 'Por qué en papel, en 2026',
          pt: 'Por que impresso, em 2026',
          ru: 'Зачем печать в 2026 году',
          zh: '为什么在 2026 年还做印刷',
          hi: '2026 में छपाई क्यों',
          bn: '2026 সালে ছাপা কেন',
          ur: '2026 میں چھپائی کیوں',
        }),
        body: pick(locale, {
          en: [
            'Because a magazine sits on a hotel reception desk for a year, and a search result lasts as long as the next scroll. A visitor who has just landed, has no local recommendations and does not know what to search for is better served by something they can pick up.',
            'The code on each listing closes the gap. Point a phone at it and the page opens, current, with the hours as they are today rather than as they were when the issue printed.',
            'That is also why a code, once printed, is permanent. A listing can change everything about itself and the code still resolves. If a business leaves us, the code explains what happened rather than failing.',
          ],
          ar: [
            'لأن المجلة تبقى على مكتب استقبال الفندق سنة كاملة، أما نتيجة البحث فتبقى إلى حين التمرير التالي. الزائر الذي وصل للتو، ولا يعرف أحداً يوصي له بمكان، ولا يعرف حتى عمّ يبحث، تخدمه أكثر صفحة يستطيع أن يمسكها بيده.',
            'والرمز المطبوع على كل مكان يسدّ الفجوة. وجّه هاتفك إليه فتُفتح الصفحة، محدّثة، بمواعيد العمل كما هي اليوم لا كما كانت يوم الطباعة.',
            'ولهذا السبب نفسه يبقى الرمز دائماً بعد طباعته. يمكن للمكان أن يغيّر كل شيء عن نفسه ويظل الرمز يعمل. وإذا غادرنا صاحب المكان، يشرح الرمز ما حدث بدل أن يتعطّل.',
          ],
          fr: [
            "Parce qu'un magazine reste un an sur le comptoir d'une réception d'hôtel, alors qu'un résultat de recherche ne dure que jusqu'au prochain défilement. Un visiteur qui vient d'arriver, sans recommandations locales et sans savoir quoi chercher, est mieux servi par quelque chose qu'il peut prendre en main.",
            "Le code de chaque fiche comble l'écart. Pointez un téléphone dessus et la page s'ouvre, à jour, avec les horaires d'aujourd'hui plutôt que ceux du jour de l'impression.",
            "C'est aussi pourquoi un code, une fois imprimé, est permanent. Une fiche peut tout changer d'elle-même, le code continue de fonctionner. Si un établissement nous quitte, le code explique ce qui s'est passé au lieu de tomber en erreur.",
          ],
          es: [
            'Porque una revista se queda un año en el mostrador de recepción de un hotel, y un resultado de búsqueda dura lo que tarda el siguiente desplazamiento. Un visitante que acaba de llegar, sin recomendaciones locales y sin saber qué buscar, está mejor servido por algo que puede tomar en la mano.',
            'El código de cada ficha cierra esa brecha. Apunta el móvil hacia él y se abre la página, actualizada, con el horario de hoy y no con el del día en que se imprimió el número.',
            'Por eso también un código, una vez impreso, es permanente. Una ficha puede cambiarlo todo y el código sigue funcionando. Si un negocio se va, el código explica lo que pasó en lugar de fallar.',
          ],
          pt: [
            'Porque uma revista fica um ano no balcão da recepção de um hotel, e um resultado de busca dura até a próxima rolagem. Um visitante que acabou de chegar, sem indicações locais e sem saber o que procurar, é mais bem servido por algo que pode pegar na mão.',
            'O código em cada ficha fecha essa lacuna. Aponte o celular para ele e a página abre, atualizada, com o horário de hoje e não o do dia em que a edição foi impressa.',
            'É também por isso que um código, depois de impresso, é permanente. Uma ficha pode mudar tudo sobre si e o código continua funcionando. Se um negócio nos deixa, o código explica o que aconteceu em vez de falhar.',
          ],
          ru: [
            'Потому что журнал год лежит на стойке регистрации в отеле, а результат поиска живёт до следующей прокрутки. Гостю, который только что прилетел, у которого нет местных рекомендаций и который не знает, что искать, больше поможет то, что можно взять в руки.',
            'Код на каждой карточке закрывает этот разрыв. Наведите на него телефон, и откроется страница — актуальная, с сегодняшними часами работы, а не с теми, что были на момент печати номера.',
            'Поэтому же напечатанный код остаётся навсегда. Заведение может изменить о себе всё, а код продолжит работать. Если заведение уходит от нас, код объясняет, что произошло, вместо того чтобы выдать ошибку.',
          ],
          zh: [
            '因为一本杂志会在酒店前台摆上一整年，而一条搜索结果只能留到下一次滑动。一位刚下飞机、没有当地人推荐、也不知道该搜什么的旅客，更需要一样可以拿在手里的东西。',
            '每个商户旁的二维码弥合了这道差距。用手机一扫，页面随即打开，内容是最新的，营业时间是今天的，而不是杂志印刷那天的。',
            '这也是二维码一经印刷便永久有效的原因。商户的一切都可以改变，二维码依然能用。如果某个商户离开了我们，二维码会说明发生了什么，而不是直接失效。',
          ],
          hi: [
            'क्योंकि एक पत्रिका होटल के रिसेप्शन पर पूरे साल रखी रहती है, और एक सर्च रिज़ल्ट बस अगली स्क्रॉल तक टिकता है। जो यात्री अभी-अभी पहुँचा है, जिसके पास कोई स्थानीय सुझाव नहीं है और जिसे यह भी नहीं पता कि क्या खोजना है, उसके लिए ऐसी चीज़ बेहतर है जिसे वह हाथ में उठा सके।',
            'हर लिस्टिंग पर छपा कोड यह दूरी मिटा देता है। फ़ोन उसकी ओर करें और पेज खुल जाता है, ताज़ा जानकारी के साथ, आज के समय के साथ, न कि उस दिन के जब अंक छपा था।',
            'इसीलिए छपने के बाद कोड स्थायी होता है। कोई लिस्टिंग अपने बारे में सब कुछ बदल सकती है, फिर भी कोड काम करता रहता है। अगर कोई व्यवसाय हमसे अलग हो जाता है, तो कोड बंद होने के बजाय बताता है कि क्या हुआ।',
          ],
          bn: [
            'কারণ একটি ম্যাগাজিন হোটেলের রিসেপশন ডেস্কে পুরো এক বছর থাকে, আর একটি সার্চ রেজাল্ট থাকে পরের স্ক্রল পর্যন্ত। যে অতিথি সবে এসে পৌঁছেছেন, যাঁর কাছে স্থানীয় কোনো পরামর্শ নেই এবং যিনি জানেনই না কী খুঁজবেন, তাঁর জন্য হাতে তুলে নেওয়ার মতো কিছু বেশি কাজের।',
            'প্রতিটি লিস্টিংয়ের কোড এই ফাঁকটা পূরণ করে। ফোন তাক করলেই পেজ খুলে যায়, হালনাগাদ তথ্যসহ, আজকের সময়সূচিসহ, সংখ্যাটি ছাপার দিনের নয়।',
            'এ কারণেই একবার ছাপা হলে কোড স্থায়ী। একটি লিস্টিং নিজের সবকিছু বদলে ফেলতে পারে, তবু কোড কাজ করে যায়। কোনো ব্যবসা আমাদের ছেড়ে গেলে কোড অচল হয়ে যাওয়ার বদলে জানিয়ে দেয় কী ঘটেছে।',
          ],
          ur: [
            'کیونکہ میگزین ہوٹل کے استقبالیہ پر پورا سال پڑا رہتا ہے، جبکہ سرچ کا نتیجہ بس اگلی اسکرول تک رہتا ہے۔ جو مہمان ابھی پہنچا ہے، جس کے پاس کوئی مقامی مشورہ نہیں اور جسے یہ بھی معلوم نہیں کہ کیا تلاش کرے، اس کے لیے وہ چیز بہتر ہے جسے وہ ہاتھ میں اٹھا سکے۔',
            'ہر لسٹنگ پر چھپا کوڈ یہ فاصلہ ختم کر دیتا ہے۔ فون اس کی طرف کریں اور صفحہ کھل جاتا ہے، تازہ معلومات کے ساتھ، آج کے اوقات کے ساتھ، نہ کہ اُس دن کے جب شمارہ چھپا تھا۔',
            'اسی لیے چھپنے کے بعد کوڈ مستقل رہتا ہے۔ کوئی لسٹنگ اپنے بارے میں سب کچھ بدل سکتی ہے، پھر بھی کوڈ کام کرتا رہتا ہے۔ اگر کوئی کاروبار ہمیں چھوڑ دے تو کوڈ ناکام ہونے کے بجائے بتاتا ہے کہ کیا ہوا۔',
          ],
        }),
      },
      {
        heading: pick(locale, {
          en: 'Curated, not crowdsourced',
          ar: 'اختيار، لا تجميع',
          fr: 'Sélectionné, pas participatif',
          es: 'Seleccionado, no colaborativo',
          pt: 'Curadoria, não colaboração aberta',
          ru: 'Отбор, а не краудсорсинг',
          zh: '精选，而非众包',
          hi: 'चुनी हुई, भीड़ से जुटाई हुई नहीं',
          bn: 'বাছাই করা, সবার লেখা নয়',
          ur: 'منتخب، ہجوم سے جمع شدہ نہیں',
        }),
        body: pick(locale, {
          en: [
            'Nobody can add themselves to Vardenia. Every listing is entered by our team, and businesses cannot publish or edit their own pages.',
            'That is slower and it is the point. A directory anybody can write themselves into is a directory of whoever is most persistent, and it is worth nothing to a reader deciding where to spend an evening.',
            '- **Verified** listings have had their details confirmed with the business directly.',
            '- Bookings are answered by the venue, not by us. We pass the request on and tell you what they said.',
            '- We do not take a commission on a booking, and a business cannot pay to be ranked above another in a way that is hidden from you.',
          ],
          ar: [
            'لا يستطيع أحد أن يضيف نفسه إلى فاردينيا. كل مكان يدخله فريقنا بنفسه، ولا يستطيع أصحاب الأعمال نشر صفحاتهم أو تعديلها.',
            'هذا أبطأ، وهذا هو المقصود. الدليل الذي يكتب فيه كل من أراد هو دليل لأكثر الناس إلحاحاً، ولا قيمة له عند قارئ يقرر أين يقضي سهرته.',
            '- الأماكن **الموثّقة** زرناها بأنفسنا وتحققنا من تفاصيلها مع صاحب المكان مباشرة.',
            '- الحجوزات يردّ عليها المكان نفسه، لا نحن. ننقل الطلب ونخبرك بما قالوه.',
            '- لا نأخذ عمولة على أي حجز، ولا يستطيع مكان أن يدفع ليظهر فوق غيره بطريقة مخفية عنك.',
          ],
          fr: [
            "Personne ne peut s'ajouter soi-même à Vardenia. Chaque fiche est saisie par notre équipe, et les établissements ne peuvent ni publier ni modifier leur propre page.",
            "C'est plus lent, et c'est voulu. Un annuaire où chacun peut s'inscrire est l'annuaire des plus insistants, et il ne vaut rien pour un lecteur qui cherche où passer sa soirée.",
            "- Les fiches marquées **Vérifié** ont vu leurs informations confirmées directement auprès de l'établissement.",
            "- Les réservations reçoivent leur réponse de l'établissement, pas de nous. Nous transmettons la demande et vous disons ce qu'il a répondu.",
            "- Nous ne prenons aucune commission sur une réservation, et un établissement ne peut pas payer pour être classé devant un autre d'une manière qui vous serait cachée.",
          ],
          es: [
            'Nadie puede añadirse a sí mismo a Vardenia. Cada ficha la introduce nuestro equipo, y los negocios no pueden publicar ni editar sus propias páginas.',
            'Es más lento, y de eso se trata. Un directorio en el que cualquiera puede apuntarse es un directorio de los más insistentes, y no le vale de nada a quien decide dónde pasar la noche.',
            '- Las fichas marcadas como **Verificado** tienen sus datos confirmados directamente con el negocio.',
            '- Las reservas las responde el local, no nosotros. Transmitimos la solicitud y te contamos lo que han dicho.',
            '- No cobramos comisión por ninguna reserva, y un negocio no puede pagar para aparecer por encima de otro de una forma que se te oculte.',
          ],
          pt: [
            'Ninguém pode se adicionar à Vardenia. Cada ficha é inserida pela nossa equipe, e os negócios não podem publicar nem editar as próprias páginas.',
            'Isso é mais lento, e é essa a ideia. Um diretório em que qualquer um se inscreve é um diretório dos mais insistentes, e não vale nada para quem está decidindo onde passar a noite.',
            '- As fichas marcadas como **Verificado** tiveram seus dados confirmados diretamente com o negócio.',
            '- As reservas são respondidas pelo estabelecimento, não por nós. Repassamos o pedido e contamos o que responderam.',
            '- Não cobramos comissão sobre reservas, e um negócio não pode pagar para aparecer acima de outro de um jeito que fique escondido de você.',
          ],
          ru: [
            'В Vardenia нельзя добавить себя самому. Каждую карточку вносит наша команда, а заведения не могут публиковать или редактировать свои страницы.',
            'Это медленнее, и в этом весь смысл. Справочник, куда может вписать себя кто угодно, — это справочник самых настойчивых, и он ничего не стоит для читателя, который решает, где провести вечер.',
            '- У карточек с отметкой **Проверено** данные подтверждены непосредственно с заведением.',
            '- На бронирования отвечает само заведение, а не мы. Мы передаём запрос и сообщаем вам его ответ.',
            '- Мы не берём комиссию за бронирование, и заведение не может заплатить, чтобы скрыто от вас оказаться выше другого.',
          ],
          zh: [
            '没有人能自行加入 Vardenia。每个商户都由我们的团队录入，商户无法自行发布或编辑自己的页面。',
            '这样更慢，而这正是用意所在。人人都能把自己写进去的指南，只是最执着者的名单，对一个正在决定今晚去哪儿的读者毫无价值。',
            '- 标有**已核实**的商户，其信息已直接与商户本人确认。',
            '- 预订由商户本身答复，而不是我们。我们转达请求，并告诉您他们的答复。',
            '- 我们不从任何预订中抽取佣金，商户也无法以对您隐瞒的方式付费排到别人前面。',
          ],
          hi: [
            'Vardenia में कोई भी ख़ुद को नहीं जोड़ सकता। हर लिस्टिंग हमारी टीम दर्ज करती है, और व्यवसाय अपने पेज न प्रकाशित कर सकते हैं, न बदल सकते हैं।',
            'यह धीमा है, और यही मक़सद है। जिस निर्देशिका में कोई भी ख़ुद को लिख सके, वह सबसे ज़्यादा ज़िद करने वालों की सूची बन जाती है, और शाम कहाँ बितानी है यह तय कर रहे पाठक के लिए उसका कोई मोल नहीं।',
            '- **सत्यापित** लिस्टिंग की जानकारी की पुष्टि सीधे व्यवसाय से की गई है।',
            '- बुकिंग का जवाब वह जगह ख़ुद देती है, हम नहीं। हम अनुरोध आगे भेजते हैं और आपको बताते हैं कि उन्होंने क्या कहा।',
            '- हम किसी बुकिंग पर कमीशन नहीं लेते, और कोई व्यवसाय आपसे छिपाकर पैसे देकर किसी दूसरे से ऊपर नहीं आ सकता।',
          ],
          bn: [
            'কেউ নিজে নিজেকে Vardenia-তে যোগ করতে পারেন না। প্রতিটি লিস্টিং আমাদের দল নিজে যোগ করে, আর ব্যবসাগুলো নিজেদের পেজ প্রকাশ বা সম্পাদনা করতে পারে না।',
            'এতে সময় বেশি লাগে, আর সেটাই উদ্দেশ্য। যে ডিরেক্টরিতে যে কেউ নিজের নাম লিখতে পারে, তা আসলে সবচেয়ে নাছোড়বান্দাদের তালিকা, আর সন্ধ্যাটা কোথায় কাটাবেন ভাবছেন এমন পাঠকের কাছে তার কোনো মূল্য নেই।',
            '- **যাচাইকৃত** লিস্টিংয়ের তথ্য সরাসরি ব্যবসার সঙ্গে নিশ্চিত করা হয়েছে।',
            '- বুকিংয়ের উত্তর দেয় জায়গাটি নিজেই, আমরা নই। আমরা অনুরোধটি পৌঁছে দিই এবং তাঁরা কী বলেছেন তা আপনাকে জানাই।',
            '- আমরা কোনো বুকিংয়ে কমিশন নিই না, আর কোনো ব্যবসা আপনার অগোচরে টাকা দিয়ে অন্যদের ওপরে উঠতে পারে না।',
          ],
          ur: [
            'Vardenia میں کوئی خود کو شامل نہیں کر سکتا۔ ہر لسٹنگ ہماری ٹیم درج کرتی ہے، اور کاروبار اپنے صفحات نہ شائع کر سکتے ہیں نہ ان میں ترمیم کر سکتے ہیں۔',
            'یہ سست ہے، اور مقصد یہی ہے۔ جس ڈائریکٹری میں کوئی بھی خود کو لکھ دے، وہ سب سے زیادہ اصرار کرنے والوں کی فہرست بن جاتی ہے، اور جو قاری شام گزارنے کی جگہ چن رہا ہو اس کے لیے اس کی کوئی قدر نہیں۔',
            '- **تصدیق شدہ** لسٹنگز کی تفصیلات کی تصدیق براہِ راست کاروبار سے کی گئی ہے۔',
            '- بکنگ کا جواب مقام خود دیتا ہے، ہم نہیں۔ ہم درخواست آگے بھیجتے ہیں اور آپ کو بتاتے ہیں کہ انہوں نے کیا کہا۔',
            '- ہم کسی بکنگ پر کمیشن نہیں لیتے، اور کوئی کاروبار آپ سے چھپا کر پیسے دے کر دوسرے سے اوپر نہیں آ سکتا۔',
          ],
        }),
      },
      {
        heading: pick(locale, {
          en: 'Who we are',
          ar: 'من نحن',
          fr: 'Qui nous sommes',
          es: 'Quiénes somos',
          pt: 'Quem somos',
          ru: 'Кто мы',
          zh: '我们是谁',
          hi: 'हम कौन हैं',
          bn: 'আমরা কারা',
          ur: 'ہم کون ہیں',
        }),
        body: [
          TBD('the registered legal entity, its company number and its registered address'),
          TBD('who runs Vardenia, and a sentence about why they started it'),
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
            'A booking is held by the venue rather than by us, so if the date is close it is worth calling them directly. Their number is on their listing page.',
          ],
          ar: [
            'اذكر الرقم المرجعي الموجود في رسالة التأكيد. شكله مثل **5N9DA470**، وهو أسرع طريقة نجد بها الحجز.',
            'الحجز يحتفظ به المكان لا نحن، فإذا كان الموعد قريباً فالأفضل الاتصال بهم مباشرة. رقمهم موجود على صفحتهم.',
          ],
          fr: [
            "Indiquez la référence figurant dans votre e-mail de confirmation. Elle ressemble à **5N9DA470**, et c'est le moyen le plus rapide pour nous de retrouver la réservation.",
            "Une réservation est tenue par l'établissement et non par nous : si la date approche, mieux vaut l'appeler directement. Son numéro figure sur sa fiche.",
          ],
          es: [
            'Indica la referencia de tu correo de confirmación. Tiene este aspecto: **5N9DA470**, y es la forma más rápida de que encontremos la reserva.',
            'La reserva la gestiona el local, no nosotros, así que si la fecha está cerca conviene llamarlos directamente. Su número está en su ficha.',
          ],
          pt: [
            'Informe a referência do seu e-mail de confirmação. Ela se parece com **5N9DA470** e é o jeito mais rápido de encontrarmos a reserva.',
            'A reserva fica com o estabelecimento, não conosco; então, se a data estiver próxima, vale a pena ligar direto para eles. O número está na ficha deles.',
          ],
          ru: [
            'Укажите номер из письма с подтверждением. Он выглядит так: **5N9DA470** — по нему мы быстрее всего найдём бронирование.',
            'Бронирование держит заведение, а не мы, поэтому, если дата близко, лучше позвонить им напрямую. Их номер есть на странице заведения.',
          ],
          zh: [
            '请提供确认邮件中的预订编号，格式类似 **5N9DA470**，这是我们找到预订最快的方式。',
            '预订由商户保留，而不是由我们保留，所以如果日期临近，最好直接致电商户。他们的电话在其商户页面上。',
          ],
          hi: [
            'अपने पुष्टि ईमेल में दिया गया रेफ़रेंस नंबर बताएँ। यह **5N9DA470** जैसा दिखता है, और बुकिंग ढूँढने का यही हमारे लिए सबसे तेज़ तरीका है।',
            'बुकिंग उस जगह के पास रहती है, हमारे पास नहीं, इसलिए अगर तारीख़ नज़दीक है तो सीधे उन्हें फ़ोन करना बेहतर है। उनका नंबर उनके लिस्टिंग पेज पर है।',
          ],
          bn: [
            'আপনার কনফার্মেশন ইমেলে থাকা রেফারেন্সটি উল্লেখ করুন। দেখতে **5N9DA470**-এর মতো, আর বুকিং খুঁজে পাওয়ার জন্য এটাই আমাদের সবচেয়ে দ্রুত উপায়।',
            'বুকিং থাকে জায়গাটির কাছে, আমাদের কাছে নয়, তাই তারিখ কাছে এলে সরাসরি ওদের ফোন করাই ভালো। ওদের নম্বর লিস্টিং পেজে আছে।',
          ],
          ur: [
            'اپنی تصدیقی ای میل میں دیا گیا ریفرنس بتائیں۔ یہ **5N9DA470** جیسا دکھتا ہے، اور بکنگ ڈھونڈنے کا یہ ہمارے لیے سب سے تیز طریقہ ہے۔',
            'بکنگ مقام کے پاس ہوتی ہے، ہمارے پاس نہیں، اس لیے اگر تاریخ قریب ہو تو براہِ راست انہیں فون کرنا بہتر ہے۔ ان کا نمبر ان کے لسٹنگ صفحے پر موجود ہے۔',
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
          TBD('the hours somebody is reading this, and how quickly we aim to reply'),
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
 * be told about French. Every answer keeps the same two admissions, because
 * both are true in every language: the legal documents are English, and so are
 * listing descriptions until they have been translated.
 */
const LANGUAGE_QUESTION: Record<Locale, { heading: string; body: string[] }> = {
  en: {
    heading: 'Is the site available in Arabic?',
    body: [
      'Yes. The site, your account, booking and these pages are all in Arabic, and the language switcher is in the header.',
      'The legal documents are in English only for now: a machine translation of a contract reads as authoritative and is not.',
      'Listings are written in English at the moment, so an Arabic page shows you the English description of a place until we have translated it.',
    ],
  },
  ar: {
    heading: 'هل الموقع متوفر بالعربية؟',
    body: [
      'نعم. الموقع وحسابك والحجز وهذه الصفحات كلها بالعربية، ومبدّل اللغة في أعلى الصفحة.',
      'الوثائق القانونية بالإنجليزية وحدها في الوقت الحالي: الترجمة الآلية لعقد تبدو ذات حجية وهي ليست كذلك.',
      'وصفحات الأماكن مكتوبة بالإنجليزية حتى الآن، فالصفحة العربية تعرض لك الوصف الإنجليزي إلى أن نترجمه.',
    ],
  },
  fr: {
    heading: 'Le site est-il disponible en français ?',
    body: [
      "Oui. Le site, votre compte, la réservation et ces pages sont en français, et le sélecteur de langue se trouve dans l'en-tête.",
      "Les documents juridiques ne sont pour l'instant qu'en anglais : la traduction automatique d'un contrat semble faire foi, et ce n'est pas le cas.",
      "Les fiches sont pour l'instant rédigées en anglais : une page en français vous montre donc la description anglaise d'un lieu tant qu'elle n'a pas été traduite.",
    ],
  },
  es: {
    heading: '¿El sitio está disponible en español?',
    body: [
      'Sí. El sitio, tu cuenta, las reservas y estas páginas están en español, y el selector de idioma está en la cabecera.',
      'Los documentos legales están solo en inglés por ahora: la traducción automática de un contrato parece tener valor oficial, y no lo tiene.',
      'Las fichas están escritas en inglés por el momento, así que una página en español te muestra la descripción en inglés de un lugar hasta que la traduzcamos.',
    ],
  },
  pt: {
    heading: 'O site está disponível em português?',
    body: [
      'Sim. O site, sua conta, as reservas e estas páginas estão em português, e o seletor de idioma fica no cabeçalho.',
      'Os documentos jurídicos estão apenas em inglês por enquanto: a tradução automática de um contrato parece ter valor oficial, e não tem.',
      'As fichas estão escritas em inglês no momento, então uma página em português mostra a descrição em inglês de um lugar até que ela seja traduzida.',
    ],
  },
  ru: {
    heading: 'Есть ли сайт на русском?',
    body: [
      'Да. Сайт, ваш аккаунт, бронирование и эти страницы доступны на русском, а переключатель языка находится в шапке сайта.',
      'Юридические документы пока только на английском: машинный перевод договора выглядит как имеющий силу, но ею не обладает.',
      'Карточки заведений пока написаны на английском, поэтому русская страница показывает английское описание места, пока мы его не переведём.',
    ],
  },
  zh: {
    heading: '网站有中文版吗？',
    body: [
      '有。网站、您的账户、预订流程和这些页面都有中文版，语言切换按钮在页面顶部。',
      '法律文件目前只有英文版：合同的机器翻译看起来具有效力，但实际上并没有。',
      '商户页面目前用英文撰写，所以在翻译完成之前，中文页面会显示该地点的英文介绍。',
    ],
  },
  hi: {
    heading: 'क्या साइट हिंदी में उपलब्ध है?',
    body: [
      'हाँ। साइट, आपका खाता, बुकिंग और ये पेज हिंदी में हैं, और भाषा बदलने का विकल्प ऊपर हेडर में है।',
      'क़ानूनी दस्तावेज़ फ़िलहाल सिर्फ़ अंग्रेज़ी में हैं: किसी अनुबंध का मशीनी अनुवाद आधिकारिक लगता है, पर होता नहीं।',
      'लिस्टिंग अभी अंग्रेज़ी में लिखी जाती हैं, इसलिए जब तक अनुवाद न हो जाए, हिंदी पेज पर किसी जगह का अंग्रेज़ी विवरण दिखता है।',
    ],
  },
  bn: {
    heading: 'সাইটটি কি বাংলায় পাওয়া যায়?',
    body: [
      'হ্যাঁ। সাইট, আপনার অ্যাকাউন্ট, বুকিং আর এই পেজগুলো বাংলায় আছে, আর ভাষা বদলানোর বোতাম ওপরের হেডারে।',
      'আইনি নথিগুলো আপাতত শুধু ইংরেজিতে: কোনো চুক্তির যন্ত্র-অনুবাদ দেখতে কর্তৃত্বপূর্ণ মনে হয়, কিন্তু তা নয়।',
      'লিস্টিংগুলো এখন ইংরেজিতে লেখা, তাই অনুবাদ না হওয়া পর্যন্ত বাংলা পেজে একটি জায়গার ইংরেজি বিবরণ দেখায়।',
    ],
  },
  ur: {
    heading: 'کیا سائٹ اردو میں دستیاب ہے؟',
    body: [
      'جی ہاں۔ سائٹ، آپ کا اکاؤنٹ، بکنگ اور یہ صفحات اردو میں ہیں، اور زبان بدلنے کا بٹن اوپر ہیڈر میں ہے۔',
      'قانونی دستاویزات فی الحال صرف انگریزی میں ہیں: کسی معاہدے کا مشینی ترجمہ مستند لگتا ہے، مگر ہوتا نہیں۔',
      'لسٹنگز ابھی انگریزی میں لکھی جاتی ہیں، اس لیے ترجمہ ہونے تک اردو صفحے پر کسی مقام کی انگریزی تفصیل دکھائی دیتی ہے۔',
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
            '- A page on the site with photographs, hours, location, and everything a visitor needs before they decide.',
            '- A printed entry in the magazine, carrying a code that opens that page.',
            '- A code that never expires. It keeps working for the life of the issue and beyond, and it follows the listing if anything about the business changes.',
            '- Bookings, if the business takes them, answered from a dashboard rather than from a phone that rings during service.',
          ],
          ar: [
            '- صفحة على الموقع فيها الصور ومواعيد العمل والموقع وكل ما يحتاجه الزائر قبل أن يقرر.',
            '- إدراج مطبوع في المجلة يحمل رمزاً يفتح تلك الصفحة.',
            '- رمز لا ينتهي. يبقى يعمل طوال عمر العدد وبعده، ويتبع الإدراج مهما تغيّر في العمل.',
            '- الحجوزات، إن كان المكان يقبلها، يردّ عليها من لوحة تحكم بدل هاتف يرن في وسط الخدمة.',
          ],
          fr: [
            '- Une page sur le site, avec photos, horaires, adresse et tout ce dont un visiteur a besoin avant de se décider.',
            '- Une entrée imprimée dans le magazine, avec un code qui ouvre cette page.',
            "- Un code qui n'expire jamais. Il fonctionne pendant toute la vie du numéro et au-delà, et il suit la fiche si quoi que ce soit change dans l'établissement.",
            "- Les réservations, si l'établissement en prend, gérées depuis un tableau de bord plutôt qu'au téléphone qui sonne en plein service.",
          ],
          es: [
            '- Una página en el sitio con fotos, horario, ubicación y todo lo que un visitante necesita antes de decidirse.',
            '- Una entrada impresa en la revista, con un código que abre esa página.',
            '- Un código que nunca caduca. Funciona durante toda la vida del número y después, y sigue a la ficha si algo del negocio cambia.',
            '- Las reservas, si el negocio las acepta, se responden desde un panel y no desde un teléfono que suena en pleno servicio.',
          ],
          pt: [
            '- Uma página no site com fotos, horários, localização e tudo o que um visitante precisa antes de decidir.',
            '- Uma entrada impressa na revista, com um código que abre essa página.',
            '- Um código que nunca expira. Ele funciona durante toda a vida da edição e depois dela, e acompanha a ficha se algo no negócio mudar.',
            '- Reservas, se o negócio aceitar, respondidas por um painel e não por um telefone que toca no meio do serviço.',
          ],
          ru: [
            '- Страница на сайте с фотографиями, часами работы, адресом и всем, что нужно гостю, прежде чем решить.',
            '- Печатная запись в журнале с кодом, который открывает эту страницу.',
            '- Код, срок действия которого никогда не истекает. Он работает всё время жизни номера и дольше и следует за карточкой, если в заведении что-то меняется.',
            '- Бронирования, если заведение их принимает, — через панель управления, а не по телефону, который звонит посреди смены.',
          ],
          zh: [
            '- 网站上的一个页面，包含照片、营业时间、位置，以及访客在做决定前需要的一切信息。',
            '- 杂志上的一条印刷条目，附有可打开该页面的二维码。',
            '- 一个永不过期的二维码。在整期杂志的生命周期内乃至之后都有效，商户有任何变化，它都会跟着页面走。',
            '- 如果商户接受预订，可以在管理后台处理，而不必在营业高峰时接听响个不停的电话。',
          ],
          hi: [
            '- साइट पर एक पेज, जिसमें तस्वीरें, समय, लोकेशन और वह सब कुछ हो जो किसी आगंतुक को फ़ैसला करने से पहले चाहिए।',
            '- पत्रिका में एक छपी हुई प्रविष्टि, जिस पर वह पेज खोलने वाला कोड हो।',
            '- एक कोड जो कभी एक्सपायर नहीं होता। वह अंक के पूरे जीवनकाल में और उसके बाद भी काम करता है, और व्यवसाय में कुछ भी बदले तो लिस्टिंग के साथ चलता है।',
            '- बुकिंग, अगर व्यवसाय लेता है, तो उनका जवाब सर्विस के बीच बजते फ़ोन के बजाय एक डैशबोर्ड से दिया जाता है।',
          ],
          bn: [
            '- সাইটে একটি পেজ, যেখানে ছবি, সময়সূচি, অবস্থান আর সিদ্ধান্ত নেওয়ার আগে একজন অতিথির যা যা দরকার সব থাকে।',
            '- ম্যাগাজিনে একটি ছাপা এন্ট্রি, যাতে সেই পেজ খোলার কোড থাকে।',
            '- এমন একটি কোড যার মেয়াদ কখনো ফুরায় না। সংখ্যাটির পুরো আয়ুষ্কাল জুড়ে এবং তার পরেও এটি কাজ করে, আর ব্যবসার কিছু বদলালে লিস্টিংকে অনুসরণ করে।',
            '- বুকিং, যদি ব্যবসাটি নেয়, তাহলে সেগুলোর উত্তর দেওয়া হয় একটি ড্যাশবোর্ড থেকে, ব্যস্ত সময়ে বেজে চলা ফোন থেকে নয়।',
          ],
          ur: [
            '- سائٹ پر ایک صفحہ جس میں تصاویر، اوقات، مقام اور وہ سب کچھ ہو جو کسی مہمان کو فیصلہ کرنے سے پہلے چاہیے۔',
            '- میگزین میں ایک چھپا ہوا اندراج، جس پر وہ صفحہ کھولنے والا کوڈ ہو۔',
            '- ایک ایسا کوڈ جو کبھی ختم نہیں ہوتا۔ یہ شمارے کی پوری عمر اور اس کے بعد بھی کام کرتا ہے، اور کاروبار میں کچھ بھی بدلے تو لسٹنگ کے ساتھ رہتا ہے۔',
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
            'We do not take a commission on bookings. What a business is paid for a table is what it keeps.',
            'A listing cannot be bought into a place it does not belong. A restaurant is under Eat & Drink whether or not it pays more than the one next to it.',
          ],
          ar: [
            'ليس مساحة إعلانية متنكرة في هيئة تحرير. الإدراجات معلّمة، والقارئ يميّز الإدراج من المقال.',
            'لا نأخذ عمولة على الحجوزات. ما يقبضه المكان مقابل الطاولة يبقى له.',
            'ولا يُشترى الإدراج ليوضع في مكان لا ينتمي إليه. المطعم تحت المأكولات والمشروبات سواء دفع أكثر من جاره أو لم يدفع.',
          ],
          fr: [
            "Ce n'est pas un espace publicitaire déguisé en contenu éditorial. Les fiches sont signalées, et un lecteur distingue une fiche d'un article.",
            "Nous ne prenons aucune commission sur les réservations. Ce qu'un établissement encaisse pour une table, il le garde.",
            "Une fiche ne s'achète pas une place qui n'est pas la sienne. Un restaurant figure dans Manger & Boire, qu'il paie plus que son voisin ou non.",
          ],
          es: [
            'No es un espacio publicitario disfrazado de contenido editorial. Las fichas están señaladas, y un lector distingue una ficha de un artículo.',
            'No cobramos comisión por las reservas. Lo que un negocio cobra por una mesa es lo que se queda.',
            'Una ficha no puede comprar un sitio que no le corresponde. Un restaurante está en Comer y beber, pague o no más que el de al lado.',
          ],
          pt: [
            'Não é um espaço publicitário disfarçado de conteúdo editorial. As fichas são identificadas, e o leitor sabe distinguir uma ficha de um artigo.',
            'Não cobramos comissão sobre reservas. O que um negócio recebe por uma mesa fica com ele.',
            'Uma ficha não compra um lugar ao qual não pertence. Um restaurante fica em Comer e beber, pague ele mais ou não do que o vizinho.',
          ],
          ru: [
            'Это не рекламное место под видом редакционного материала. Карточки помечены, и читатель отличит карточку от статьи.',
            'Мы не берём комиссию за бронирования. Что заведение получает за столик, то у него и остаётся.',
            'Карточку нельзя купить в раздел, которому она не принадлежит. Ресторан находится в разделе «Еда и напитки», платит он больше соседа или нет.',
          ],
          zh: [
            '它不是伪装成编辑内容的广告位。收录条目都有标注，读者能分清哪是商户条目、哪是文章。',
            '我们不从预订中抽取佣金。商户因一张餐位收到的钱，全部归商户所有。',
            '收录不能花钱买到不属于它的位置。一家餐厅就在“餐饮”栏目里，无论它是否比隔壁付得更多。',
          ],
          hi: [
            'यह संपादकीय के भेस में कोई विज्ञापन स्लॉट नहीं है। लिस्टिंग पर निशान होता है, और पाठक लिस्टिंग और लेख में फ़र्क़ कर सकता है।',
            'हम बुकिंग पर कोई कमीशन नहीं लेते। किसी मेज़ के लिए व्यवसाय को जो मिलता है, वह पूरा उसी का रहता है।',
            'पैसे देकर लिस्टिंग को ऐसी जगह नहीं रखवाया जा सकता जहाँ वह नहीं बैठती। रेस्तराँ खाना-पीना में ही रहेगा, चाहे वह पड़ोसी से ज़्यादा पैसे दे या न दे।',
          ],
          bn: [
            'এটি সম্পাদকীয়র ছদ্মবেশে কোনো বিজ্ঞাপনের জায়গা নয়। লিস্টিং চিহ্নিত থাকে, আর পাঠক লিস্টিং ও প্রবন্ধের পার্থক্য বুঝতে পারেন।',
            'আমরা বুকিংয়ে কোনো কমিশন নিই না। একটি টেবিলের জন্য ব্যবসা যা পায়, পুরোটাই তার থাকে।',
            'টাকা দিয়ে কোনো লিস্টিংকে এমন জায়গায় বসানো যায় না যেখানে তার থাকার কথা নয়। একটি রেস্তোরাঁ খাওয়া-দাওয়া বিভাগেই থাকবে, পাশেরটির চেয়ে বেশি টাকা দিক বা না দিক।',
          ],
          ur: [
            'یہ ادارتی مواد کے بھیس میں کوئی اشتہاری جگہ نہیں۔ لسٹنگز پر نشان ہوتا ہے، اور قاری لسٹنگ اور مضمون میں فرق کر سکتا ہے۔',
            'ہم بکنگز پر کوئی کمیشن نہیں لیتے۔ کسی میز کے عوض کاروبار کو جو ملتا ہے وہ پورا اسی کا رہتا ہے۔',
            'پیسے دے کر کسی لسٹنگ کو ایسی جگہ نہیں رکھوایا جا سکتا جہاں اس کا تعلق نہ ہو۔ ریستوران کھانا پینا ہی میں رہے گا، چاہے وہ پڑوسی سے زیادہ ادا کرے یا نہیں۔',
          ],
        }),
      },
      {
        heading: pick(locale, {
          en: 'What it costs',
          ar: 'التكلفة',
          fr: 'Combien ça coûte',
          es: 'Cuánto cuesta',
          pt: 'Quanto custa',
          ru: 'Сколько это стоит',
          zh: '费用',
          hi: 'इसकी क़ीमत',
          bn: 'খরচ কত',
          ur: 'قیمت',
        }),
        body: [
          TBD('the tiers, what each includes, and the price of each'),
          TBD('the contract length, and what happens at renewal'),
          TBD('the print deadline for the next issue'),
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
          TBD('the ad formats and sizes, and the price of each'),
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

export function addYourBusinessPage(locale: Locale = 'en'): ContentPage {
  return {
    title: pick(locale, {
      en: 'Add your business',
      ar: 'أضف عملك',
      fr: 'Ajouter votre établissement',
      es: 'Añade tu negocio',
      pt: 'Adicione seu negócio',
      ru: 'Добавить своё заведение',
      zh: '添加您的商户',
      hi: 'अपना व्यवसाय जोड़ें',
      bn: 'আপনার ব্যবসা যোগ করুন',
      ur: 'اپنا کاروبار شامل کریں',
    }),
    intro: pick(locale, {
      en: 'Every listing in Vardenia is entered by our team, so this starts with a conversation rather than a form that publishes itself.',
      ar: 'كل إدراج في فاردينيا يدخله فريقنا بنفسه، فالبداية محادثة لا استمارة تنشر نفسها.',
      fr: 'Chaque fiche de Vardenia est saisie par notre équipe : tout commence donc par une conversation, pas par un formulaire qui se publie tout seul.',
      es: 'Cada ficha de Vardenia la introduce nuestro equipo, así que esto empieza con una conversación y no con un formulario que se publica solo.',
      pt: 'Cada ficha da Vardenia é inserida pela nossa equipe, então isso começa com uma conversa, e não com um formulário que se publica sozinho.',
      ru: 'Каждую карточку в Vardenia вносит наша команда, поэтому всё начинается с разговора, а не с формы, которая публикует сама себя.',
      zh: 'Vardenia 的每个商户都由我们的团队录入，所以这一切从一次沟通开始，而不是一张会自动发布的表单。',
      hi: 'Vardenia की हर लिस्टिंग हमारी टीम दर्ज करती है, इसलिए शुरुआत एक बातचीत से होती है, किसी ऐसे फ़ॉर्म से नहीं जो ख़ुद प्रकाशित हो जाए।',
      bn: 'Vardenia-র প্রতিটি লিস্টিং আমাদের দল নিজে যোগ করে, তাই এর শুরু একটি কথোপকথনে, এমন কোনো ফর্মে নয় যা নিজে থেকেই প্রকাশ হয়ে যায়।',
      ur: 'Vardenia کی ہر لسٹنگ ہماری ٹیم درج کرتی ہے، اس لیے اس کی شروعات ایک گفتگو سے ہوتی ہے، کسی ایسے فارم سے نہیں جو خود بخود شائع ہو جائے۔',
    }),
    sections: [
      {
        heading: pick(locale, {
          en: 'What to send',
          ar: 'ما ترسله',
          fr: "Ce qu'il faut envoyer",
          es: 'Qué enviar',
          pt: 'O que enviar',
          ru: 'Что прислать',
          zh: '需要发送什么',
          hi: 'क्या भेजें',
          bn: 'কী পাঠাবেন',
          ur: 'کیا بھیجیں',
        }),
        body: pick(locale, {
          en: [
            '- The name of the business and where it is.',
            '- What it is: a hotel, a restaurant, a wedding venue, a clinic, a car service.',
            "- A sentence or two about what makes it worth a visitor's evening.",
            '- A website or a social account, if there is one.',
            '- Whether you would want to take bookings through Vardenia.',
          ],
          ar: [
            '- اسم العمل وأين هو.',
            '- ما هو: فندق، مطعم، قاعة أعراس، عيادة، خدمة سيارات.',
            '- جملة أو جملتان عمّا يجعله يستحق سهرة زائر.',
            '- موقع إلكتروني أو حساب على مواقع التواصل، إن وُجد.',
            '- وهل تريد أن تستقبل الحجوزات عبر فاردينيا.',
          ],
          fr: [
            "- Le nom de l'établissement et où il se trouve.",
            "- Ce que c'est : un hôtel, un restaurant, une salle de mariage, une clinique, un service de voitures.",
            "- Une phrase ou deux sur ce qui vaut à un visiteur d'y passer sa soirée.",
            "- Un site web ou un compte sur les réseaux sociaux, s'il y en a un.",
            '- Si vous souhaitez recevoir des réservations via Vardenia.',
          ],
          es: [
            '- El nombre del negocio y dónde está.',
            '- Qué es: un hotel, un restaurante, un salón de bodas, una clínica, un servicio de coches.',
            '- Una o dos frases sobre por qué merece la noche de un visitante.',
            '- Una web o una cuenta en redes sociales, si la hay.',
            '- Si te gustaría recibir reservas a través de Vardenia.',
          ],
          pt: [
            '- O nome do negócio e onde fica.',
            '- O que é: um hotel, um restaurante, um espaço para casamentos, uma clínica, um serviço de carros.',
            '- Uma ou duas frases sobre o que faz dele um bom programa para a noite de um visitante.',
            '- Um site ou perfil em rede social, se houver.',
            '- Se você gostaria de receber reservas pela Vardenia.',
          ],
          ru: [
            '- Название заведения и где оно находится.',
            '- Что это: отель, ресторан, свадебный зал, клиника, служба такси.',
            '- Одно-два предложения о том, почему гостю стоит провести там вечер.',
            '- Сайт или страница в соцсетях, если есть.',
            '- Хотите ли вы принимать бронирования через Vardenia.',
          ],
          zh: [
            '- 商户名称及所在位置。',
            '- 它是什么：酒店、餐厅、婚礼场地、诊所、用车服务。',
            '- 一两句话，说说为什么值得访客在这里度过一个晚上。',
            '- 网站或社交媒体账号（如有）。',
            '- 是否希望通过 Vardenia 接受预订。',
          ],
          hi: [
            '- व्यवसाय का नाम और वह कहाँ है।',
            '- वह क्या है: होटल, रेस्तराँ, शादी का स्थल, क्लिनिक, कार सेवा।',
            '- एक-दो वाक्य कि किसी आगंतुक की शाम के लिए वह क्यों ख़ास है।',
            '- कोई वेबसाइट या सोशल अकाउंट, अगर हो।',
            '- क्या आप Vardenia के ज़रिए बुकिंग लेना चाहेंगे।',
          ],
          bn: [
            '- ব্যবসার নাম এবং সেটি কোথায়।',
            '- এটি কী: হোটেল, রেস্তোরাঁ, বিয়ের ভেন্যু, ক্লিনিক, গাড়ি সেবা।',
            '- একটি বা দুটি বাক্য, কেন সেটি একজন অতিথির সন্ধ্যা কাটানোর মতো জায়গা।',
            '- ওয়েবসাইট বা সোশ্যাল অ্যাকাউন্ট, যদি থাকে।',
            '- আপনি Vardenia-র মাধ্যমে বুকিং নিতে চান কি না।',
          ],
          ur: [
            '- کاروبار کا نام اور وہ کہاں ہے۔',
            '- وہ کیا ہے: ہوٹل، ریستوران، شادی ہال، کلینک، کار سروس۔',
            '- ایک دو جملے کہ کسی مہمان کی شام کے لیے وہ کیوں خاص ہے۔',
            '- کوئی ویب سائٹ یا سوشل اکاؤنٹ، اگر ہو۔',
            '- کیا آپ Vardenia کے ذریعے بکنگ لینا چاہیں گے۔',
          ],
        }),
      },
      {
        heading: pick(locale, {
          en: 'What happens next',
          ar: 'ماذا يحدث بعدها',
          fr: 'Et ensuite',
          es: 'Qué pasa después',
          pt: 'O que acontece depois',
          ru: 'Что дальше',
          zh: '接下来会怎样',
          hi: 'आगे क्या होता है',
          bn: 'এরপর কী হয়',
          ur: 'اس کے بعد کیا ہوتا ہے',
        }),
        body: [
          contactEmail(locale),
          ...pick(locale, {
            en: [
              'We look at every business that gets in touch. If it is right for the directory we will come back to you with what a listing involves and what it costs.',
              'If it is not, we will say so plainly rather than leaving you waiting. A directory is only worth something to a reader if some things are left out.',
            ],
            ar: [
              'ننظر في كل عمل يتواصل معنا. إذا كان مناسباً للدليل نعود إليك بما يتضمنه الإدراج وبتكلفته.',
              'وإذا لم يكن، نقول ذلك بوضوح بدل أن نتركك تنتظر. الدليل لا يساوي شيئاً عند القارئ إلا إذا بقي شيء خارجه.',
            ],
            fr: [
              "Nous examinons chaque établissement qui nous contacte. S'il a sa place dans l'annuaire, nous reviendrons vers vous avec ce qu'implique une fiche et ce qu'elle coûte.",
              "Sinon, nous vous le dirons clairement plutôt que de vous laisser attendre. Un annuaire n'a de valeur pour un lecteur que si certaines choses en sont exclues.",
            ],
            es: [
              'Revisamos cada negocio que se pone en contacto. Si encaja en el directorio, te responderemos con lo que implica una ficha y lo que cuesta.',
              'Si no, te lo diremos con claridad en lugar de dejarte esperando. Un directorio solo vale algo para un lector si algunas cosas se quedan fuera.',
            ],
            pt: [
              'Analisamos todo negócio que entra em contato. Se ele combinar com o diretório, voltaremos com o que uma ficha envolve e quanto custa.',
              'Se não combinar, diremos isso com clareza em vez de deixar você esperando. Um diretório só vale algo para o leitor se algumas coisas ficarem de fora.',
            ],
            ru: [
              'Мы рассматриваем каждое заведение, которое к нам обращается. Если оно подходит для справочника, мы ответим, что включает карточка и сколько она стоит.',
              'Если нет, мы прямо об этом скажем, а не оставим вас ждать. Справочник чего-то стоит для читателя, только если в него попадает не всё.',
            ],
            zh: [
              '每一家联系我们的商户，我们都会认真查看。如果适合收录，我们会告诉您收录包含什么、需要多少费用。',
              '如果不适合，我们会直接告诉您，而不是让您一直等。只有有所取舍，一份指南对读者才有价值。',
            ],
            hi: [
              'जो भी व्यवसाय हमसे संपर्क करता है, हम उसे देखते हैं। अगर वह निर्देशिका के लिए ठीक है, तो हम आपको बताएँगे कि लिस्टिंग में क्या शामिल है और उसकी क़ीमत क्या है।',
              'अगर नहीं है, तो हम आपको इंतज़ार कराने के बजाय साफ़-साफ़ बता देंगे। निर्देशिका पाठक के लिए तभी कुछ मायने रखती है जब कुछ चीज़ें उससे बाहर रहें।',
            ],
            bn: [
              'যে ব্যবসাই যোগাযোগ করে, আমরা সেটি দেখি। ডিরেক্টরির জন্য উপযুক্ত হলে লিস্টিংয়ে কী থাকে আর তার খরচ কত, তা নিয়ে আমরা আপনার কাছে ফিরব।',
              'উপযুক্ত না হলে আপনাকে অপেক্ষায় না রেখে সোজাসুজি জানিয়ে দেব। কিছু জিনিস বাদ না পড়লে একটি ডিরেক্টরি পাঠকের কাছে মূল্যহীন।',
            ],
            ur: [
              'جو بھی کاروبار ہم سے رابطہ کرتا ہے، ہم اسے دیکھتے ہیں۔ اگر وہ ڈائریکٹری کے لیے موزوں ہو تو ہم آپ کو بتائیں گے کہ لسٹنگ میں کیا شامل ہے اور اس کی قیمت کیا ہے۔',
              'اگر نہیں، تو ہم آپ کو انتظار کروانے کے بجائے صاف بتا دیں گے۔ ڈائریکٹری قاری کے لیے تبھی قیمتی ہے جب کچھ چیزیں اس سے باہر رہیں۔',
            ],
          }),
          TBD('how long we aim to take to reply'),
        ],
      },
      {
        heading: pick(locale, {
          en: 'If you are already listed',
          ar: 'إذا كنت مدرجاً بالفعل',
          fr: 'Si vous êtes déjà référencé',
          es: 'Si ya estás en el directorio',
          pt: 'Se você já está no diretório',
          ru: 'Если вы уже в справочнике',
          zh: '如果您已被收录',
          hi: 'अगर आप पहले से लिस्ट हैं',
          bn: 'আপনি যদি আগে থেকেই লিস্টিংয়ে থাকেন',
          ur: 'اگر آپ پہلے سے لسٹ ہیں',
        }),
        body: pick(locale, {
          en: [
            'To correct something on an existing listing, or to add photographs, get in touch and we will update it. Businesses cannot edit their own pages.',
            'To answer bookings, sign in at **For partners**. If you have not been given an account and you want one, say so.',
          ],
          ar: [
            'لتصحيح شيء في إدراج قائم أو لإضافة صور، تواصل معنا ونحدّثه. لا يستطيع أصحاب الأعمال تعديل صفحاتهم بأنفسهم.',
            'وللرد على الحجوزات، سجّل الدخول من **للشركاء**. وإذا لم يُنشأ لك حساب وتريد واحداً، أخبرنا.',
          ],
          fr: [
            'Pour corriger quelque chose sur une fiche existante ou ajouter des photos, contactez-nous et nous la mettrons à jour. Les établissements ne peuvent pas modifier leurs propres pages.',
            "Pour répondre aux réservations, connectez-vous via **Pour les partenaires**. Si vous n'avez pas reçu de compte et en voulez un, dites-le-nous.",
          ],
          es: [
            'Para corregir algo de una ficha existente o añadir fotos, ponte en contacto y la actualizaremos. Los negocios no pueden editar sus propias páginas.',
            'Para responder a las reservas, inicia sesión en **Para socios**. Si no te han dado una cuenta y quieres una, dínoslo.',
          ],
          pt: [
            'Para corrigir algo em uma ficha existente ou adicionar fotos, entre em contato e nós atualizamos. Os negócios não podem editar as próprias páginas.',
            'Para responder às reservas, entre por **Para parceiros**. Se você não recebeu uma conta e quer uma, avise.',
          ],
          ru: [
            'Чтобы исправить что-то в существующей карточке или добавить фотографии, свяжитесь с нами, и мы её обновим. Заведения не могут редактировать свои страницы сами.',
            'Чтобы отвечать на бронирования, войдите через раздел **Для партнёров**. Если у вас нет аккаунта и он вам нужен, сообщите нам.',
          ],
          zh: [
            '如需修改现有页面上的信息或添加照片，请联系我们，我们会为您更新。商户无法自行编辑页面。',
            '要处理预订，请通过**面向合作伙伴**登录。如果您还没有账户但需要一个，请告诉我们。',
          ],
          hi: [
            'किसी मौजूदा लिस्टिंग में कुछ सुधारना हो या तस्वीरें जोड़नी हों, तो हमसे संपर्क करें और हम उसे अपडेट कर देंगे। व्यवसाय अपने पेज ख़ुद नहीं बदल सकते।',
            'बुकिंग का जवाब देने के लिए **साझेदारों के लिए** से साइन इन करें। अगर आपको खाता नहीं मिला है और आप चाहते हैं, तो हमें बताइए।',
          ],
          bn: [
            'বিদ্যমান কোনো লিস্টিংয়ে কিছু সংশোধন করতে বা ছবি যোগ করতে আমাদের সঙ্গে যোগাযোগ করুন, আমরা সেটি হালনাগাদ করে দেব। ব্যবসাগুলো নিজেদের পেজ সম্পাদনা করতে পারে না।',
            'বুকিংয়ের উত্তর দিতে **অংশীদারদের জন্য** থেকে সাইন ইন করুন। আপনাকে অ্যাকাউন্ট দেওয়া না হয়ে থাকলে এবং আপনি একটি চাইলে, আমাদের জানান।',
          ],
          ur: [
            'کسی موجودہ لسٹنگ میں کچھ درست کرنا ہو یا تصاویر شامل کرنی ہوں تو ہم سے رابطہ کریں، ہم اسے اپ ڈیٹ کر دیں گے۔ کاروبار اپنے صفحات خود تبدیل نہیں کر سکتے۔',
            'بکنگز کا جواب دینے کے لیے **شراکت داروں کے لیے** سے سائن اِن کریں۔ اگر آپ کو اکاؤنٹ نہیں دیا گیا اور آپ چاہتے ہیں تو ہمیں بتائیں۔',
          ],
        }),
      },
    ],
  }
}
