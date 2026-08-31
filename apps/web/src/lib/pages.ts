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
 * page is worse than a visible gap.
 *
 * # Both languages, in one file
 *
 * Each builder takes a locale and returns that language's copy. The pages used
 * to be English under an Arabic URL, which was worse than it sounds: the layout
 * is RTL, and the bidirectional algorithm moves an English sentence's full stop
 * to the left edge, so "Is Vardenia free to use?" rendered as
 * "?Is Vardenia free to use" and read as broken rather than as untranslated.
 *
 * The two versions live side by side rather than in separate files so that a
 * changed promise is one diff with both languages in it. A translation in
 * another file is a translation that drifts, and here drift means the Arabic
 * page promising something the English one no longer does.
 *
 * The Arabic is a translation of meaning, not of words, and it has not been
 * reviewed by a native speaker. It should be before launch: these pages carry
 * commercial commitments, and a mistranslated promise is still a promise.
 *
 * The legal documents remain English in both editions, deliberately. See
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
 * Picks a language. Named for what it does at the call site rather than for its
 * types, because it appears once per section and the copy is what should be
 * readable there.
 */
const pick = <T>(locale: Locale, en: T, ar: T): T => (locale === 'ar' ? ar : en)

// --------------------------------------------------------------------- about

export function aboutPage(locale: Locale = 'en'): ContentPage {
  const ar = locale === 'ar'

  return {
    title: pick(locale, 'About Vardenia', 'عن فاردينيا'),
    intro: pick(
      locale,
      'Vardenia is a printed magazine and an online directory of places worth going in Lebanon. The two are one product: what is in the magazine is on the site, and every listing in print carries a code that opens it.',
      'فاردينيا مجلة مطبوعة ودليل إلكتروني للأماكن التي تستحق الزيارة في لبنان. الاثنان منتج واحد: ما تجده في المجلة تجده على الموقع، وكل مكان مدرج في النسخة المطبوعة يحمل رمزاً يفتح صفحته.',
    ),
    sections: [
      {
        heading: pick(locale, 'Why print, in 2026', 'لماذا الطباعة، في 2026'),
        body: ar
          ? [
              'لأن المجلة تبقى على مكتب استقبال الفندق سنة كاملة، أما نتيجة البحث فتبقى إلى حين التمرير التالي. الزائر الذي وصل للتو، ولا يعرف أحداً يوصي له بمكان، ولا يعرف حتى عمّ يبحث، تخدمه أكثر صفحة يستطيع أن يمسكها بيده.',
              'والرمز المطبوع على كل مكان يسدّ الفجوة. وجّه هاتفك إليه فتُفتح الصفحة، محدّثة، بمواعيد العمل كما هي اليوم لا كما كانت يوم الطباعة.',
              'ولهذا السبب نفسه يبقى الرمز دائماً بعد طباعته. يمكن للمكان أن يغيّر كل شيء عن نفسه ويظل الرمز يعمل. وإذا غادرنا صاحب المكان، يشرح الرمز ما حدث بدل أن يتعطّل.',
            ]
          : [
              'Because a magazine sits on a hotel reception desk for a year, and a search result lasts as long as the next scroll. A visitor who has just landed, has no local recommendations and does not know what to search for is better served by something they can pick up.',
              'The code on each listing closes the gap. Point a phone at it and the page opens, current, with the hours as they are today rather than as they were when the issue printed.',
              'That is also why a code, once printed, is permanent. A listing can change everything about itself and the code still resolves. If a business leaves us, the code explains what happened rather than failing.',
            ],
      },
      {
        heading: pick(locale, 'Curated, not crowdsourced', 'اختيار، لا تجميع'),
        body: ar
          ? [
              'لا يستطيع أحد أن يضيف نفسه إلى فاردينيا. كل مكان يدخله فريقنا بنفسه، ولا يستطيع أصحاب الأعمال نشر صفحاتهم أو تعديلها.',
              'هذا أبطأ، وهذا هو المقصود. الدليل الذي يكتب فيه كل من أراد هو دليل لأكثر الناس إلحاحاً، ولا قيمة له عند قارئ يقرر أين يقضي سهرته.',
              '- الأماكن **الموثّقة** زرناها بأنفسنا وتحققنا من تفاصيلها مع صاحب المكان مباشرة.',
              '- الحجوزات يردّ عليها المكان نفسه، لا نحن. ننقل الطلب ونخبرك بما قالوه.',
              '- لا نأخذ عمولة على أي حجز، ولا يستطيع مكان أن يدفع ليظهر فوق غيره بطريقة مخفية عنك.',
            ]
          : [
              'Nobody can add themselves to Vardenia. Every listing is entered by our team, and businesses cannot publish or edit their own pages.',
              'That is slower and it is the point. A directory anybody can write themselves into is a directory of whoever is most persistent, and it is worth nothing to a reader deciding where to spend an evening.',
              '- **Verified** listings have had their details confirmed with the business directly.',
              '- Bookings are answered by the venue, not by us. We pass the request on and tell you what they said.',
              '- We do not take a commission on a booking, and a business cannot pay to be ranked above another in a way that is hidden from you.',
            ],
      },
      {
        heading: pick(locale, 'Who we are', 'من نحن'),
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
  const ar = locale === 'ar'

  return {
    title: pick(locale, 'Contact', 'اتصل بنا'),
    intro: pick(
      locale,
      'For anything about a booking, a listing, or the magazine. We read everything that comes in and answer in the order it arrives.',
      'لأي أمر يخص حجزاً أو مكاناً مدرجاً أو المجلة. نقرأ كل ما يصلنا ونجيب بالترتيب الذي يصل به.',
    ),
    sections: [
      {
        heading: pick(locale, 'If it is about a booking', 'إذا كان الأمر يخص حجزاً'),
        body: ar
          ? [
              'اذكر الرقم المرجعي الموجود في رسالة التأكيد. شكله مثل **5N9DA470**، وهو أسرع طريقة نجد بها الحجز.',
              'الحجز يحتفظ به المكان لا نحن، فإذا كان الموعد قريباً فالأفضل الاتصال بهم مباشرة. رقمهم موجود على صفحتهم.',
            ]
          : [
              'Quote the reference from your confirmation email. It looks like **5N9DA470** and it is the fastest way for us to find the reservation.',
              'A booking is held by the venue rather than by us, so if the date is close it is worth calling them directly. Their number is on their listing page.',
            ],
      },
      {
        heading: pick(locale, 'If you are a business', 'إذا كنت صاحب عمل'),
        body: ar
          ? [
              'لإدراج مكانك، انظر **أضف عملك**. للإعلان في المجلة، انظر **أعلن معنا**.',
              'وإذا كان لديك حساب شريك ولا تستطيع الدخول، أخبرنا هنا ونحلّها بدل أن ندور بك في حلقة استعادة كلمة السر.',
            ]
          : [
              'To be listed, see **Add your business**. To advertise in the magazine, see **Advertise with us**.',
              'If you already have a partner account and cannot sign in, say so here and we will sort it out rather than sending you round a reset loop.',
            ],
      },
      {
        heading: pick(locale, 'How to reach us', 'كيف تصل إلينا'),
        body: [
          contactEmail(ar ? 'ar' : 'en'),
          contactPostal(ar ? 'ar' : 'en'),
          TBD('the hours somebody is reading this, and how quickly we aim to reply'),
        ],
      },
    ],
  }
}

// ----------------------------------------------------------------------- faq

export function faqPage(locale: Locale = 'en'): ContentPage {
  const ar = locale === 'ar'

  return {
    title: pick(locale, 'Questions', 'أسئلة شائعة'),
    intro: pick(
      locale,
      'The things people ask most often, answered plainly.',
      'أكثر ما يُسأل عنه، بإجابات واضحة.',
    ),
    sections: [
      {
        heading: pick(locale, 'Is Vardenia free to use?', 'هل استخدام فاردينيا مجاني؟'),
        body: ar
          ? [
              'نعم. قراءة الموقع وتصفّح الأماكن والحجز وقراءة المجلة إلكترونياً، كلها بلا مقابل.',
              'التصفّح لا يحتاج حساباً. الحجز يحتاج، لأن المكان الذي يحجز لك طاولة يحتاج أن يعرف كيف يصل إليك.',
            ]
          : [
              'Yes. Reading the site, browsing listings, booking and reading the magazine online all cost nothing.',
              'Browsing needs no account. Booking does, because a venue holding a table needs to know it can reach you.',
            ],
      },
      {
        heading: pick(locale, 'Do I need an account to book?', 'هل أحتاج حساباً لأحجز؟'),
        body: ar
          ? [
              'نعم، ولا يستغرق الأمر أكثر من دقيقة. تسجّل باسمك وبريدك الإلكتروني، ثم تؤكّد البريد من الرابط الذي نرسله لك. لا يمر الحجز قبل تأكيد البريد، حتى لا يبقي مكانٌ طاولةً فارغة لشخص لا يمكن الوصول إليه.',
              'إذا لم يصل الرابط خلال دقائق، ابحث في مجلد الرسائل غير المرغوب فيها.',
              'وبعدها تبقى كل حجوزاتك في مكان واحد، ويمكنك الإلغاء من هناك.',
            ]
          : [
              'Yes, and it takes a minute. You sign up with your name and email address, then confirm the address from the link we send you. Bookings only go through once the address is confirmed, so that a venue keeping a table free is not doing it for somebody who cannot be reached.',
              'If the link has not arrived after a few minutes, look in your junk folder.',
              'Everything you book is then kept in one place, and you can cancel from there.',
            ],
      },
      {
        heading: pick(locale, 'Can you book for me over WhatsApp?', 'هل تحجزون لي عبر واتساب؟'),
        body: ar
          ? [
              'نعم. راسلنا ونحجز لك، باسمك وبريدك الإلكتروني.',
              'ستصلك رسالة تأكيد كأي شخص آخر. وإذا أردت لاحقاً أن ترى حجوزاتك على الموقع، سجّل بالبريد نفسه وستجدها بانتظارك.',
            ]
          : [
              'Yes. Message us and we will make the booking for you, using your name and email address.',
              'You will get a confirmation like anyone else. If you later want to see your bookings on the site, sign up with the same email address and they will be there.',
            ],
      },
      {
        heading: pick(locale, 'Is my booking confirmed straight away?', 'هل يتأكد الحجز فوراً؟'),
        body: ar
          ? [
              'يعتمد على المكان. بعضهم يؤكد فوراً، وبعضهم يريد مراجعة دفتر الحجوزات أولاً، فيصل الطلب عندهم كطلب لا كتأكيد.',
              'في الحالتين نخبرك بالبريد بما حدث، وصفحة المكان تقول أي النوعين هو قبل أن ترسل أي شيء.',
            ]
          : [
              'It depends on the venue. Some confirm immediately; others want to look at the book first, and those arrive as a request.',
              'Either way you are told by email what happened, and the listing says which kind it is before you send anything.',
            ],
      },
      {
        heading: pick(
          locale,
          'I scanned a code and the listing had moved',
          'مسحت رمزاً فوجدت أن المكان لم يعد موجوداً',
        ),
        body: ar
          ? [
              'هذا يعني أن المكان لم يعد معنا، أو أن إدراجه سُحب بعد طباعة العدد. الرمز ما زال يعمل وسيبقى يعمل؛ لكنه يشرح نفسه بدل أن يفتح صفحة لم تعد صحيحة.',
              'والصفحة التي يصل إليها تعرض عليك بقية الدليل، وهو غالباً ما كنت تبحث عنه أصلاً.',
            ]
          : [
              'That means the business is no longer with us, or the listing was withdrawn after the issue printed. The code still works and always will; it just explains itself instead of opening a page that is no longer true.',
              'The page it lands on offers the rest of the directory, which is usually what you wanted anyway.',
            ],
      },
      {
        heading: pick(locale, 'How do I get my business listed?', 'كيف أُدرج عملي؟'),
        body: ar
          ? ['انظر **أضف عملك**. لا يستطيع أحد أن يضيف نفسه، فالبداية تكون برسالة.']
          : ['See **Add your business**. Nobody can add themselves, so it starts with a message.'],
      },
      {
        heading: pick(locale, 'Can I have my data deleted?', 'هل يمكن حذف بياناتي؟'),
        body: ar
          ? [
              'نعم، ويمكنك ذلك بنفسك من حسابك دون أن تسألنا. يُحذف كل ما يدل عليك.',
              'الحجوزات التي تمت فعلاً تبقى في سجل المكان بلا أي بيانات شخصية، لأن الحجز سجلّ تجاري لهم بقدر ما هو سجلّ لك.',
            ]
          : [
              'Yes, and you can do it yourself from your account without asking us. Everything identifying is removed.',
              "Bookings that already happened stay on the venue's record with nothing personal on them, because a reservation is their business record as much as yours.",
            ],
      },
      {
        heading: pick(locale, 'Is the site available in Arabic?', 'هل الموقع متوفر بالعربية؟'),
        body: ar
          ? [
              'نعم. الموقع وحسابك والحجز وهذه الصفحات كلها بالعربية، ومبدّل اللغة في أعلى الصفحة.',
              'الوثائق القانونية بالإنجليزية وحدها في الوقت الحالي: الترجمة الآلية لعقد تبدو ذات حجية وهي ليست كذلك.',
              'وصفحات الأماكن مكتوبة بالإنجليزية حتى الآن، فالصفحة العربية تعرض لك الوصف الإنجليزي إلى أن نترجمه.',
            ]
          : [
              'Yes. The site, your account, booking and these pages are all in Arabic, and the language switcher is in the header.',
              'The legal documents are in English only for now: a machine translation of a contract reads as authoritative and is not.',
              'Listings are written in English at the moment, so an Arabic page shows you the English description of a place until we have translated it.',
            ],
      },
    ],
  }
}

// ---------------------------------------------------------- partner with us

export function partnerWithUsPage(locale: Locale = 'en'): ContentPage {
  const ar = locale === 'ar'

  return {
    title: pick(locale, 'Partner with us', 'كن شريكاً'),
    intro: pick(
      locale,
      'A Vardenia listing puts a business in front of people who are deciding where to go, in print and online, with one code connecting the two.',
      'إدراجك في فاردينيا يضع عملك أمام من يقرر الآن إلى أين يذهب، مطبوعاً وإلكترونياً، برمز واحد يربط الاثنين.',
    ),
    sections: [
      {
        heading: pick(locale, 'What a listing is', 'ما هو الإدراج'),
        body: ar
          ? [
              '- صفحة على الموقع فيها الصور ومواعيد العمل والموقع وكل ما يحتاجه الزائر قبل أن يقرر.',
              '- إدراج مطبوع في المجلة يحمل رمزاً يفتح تلك الصفحة.',
              '- رمز لا ينتهي. يبقى يعمل طوال عمر العدد وبعده، ويتبع الإدراج مهما تغيّر في العمل.',
              '- الحجوزات، إن كان المكان يقبلها، يردّ عليها من لوحة تحكم بدل هاتف يرن في وسط الخدمة.',
            ]
          : [
              '- A page on the site with photographs, hours, location, and everything a visitor needs before they decide.',
              '- A printed entry in the magazine, carrying a code that opens that page.',
              '- A code that never expires. It keeps working for the life of the issue and beyond, and it follows the listing if anything about the business changes.',
              '- Bookings, if the business takes them, answered from a dashboard rather than from a phone that rings during service.',
            ],
      },
      {
        heading: pick(locale, 'What it is not', 'ما ليس هو'),
        body: ar
          ? [
              'ليس مساحة إعلانية متنكرة في هيئة تحرير. الإدراجات معلّمة، والقارئ يميّز الإدراج من المقال.',
              'لا نأخذ عمولة على الحجوزات. ما يقبضه المكان مقابل الطاولة يبقى له.',
              'ولا يُشترى الإدراج ليوضع في مكان لا ينتمي إليه. المطعم تحت المأكولات والمشروبات سواء دفع أكثر من جاره أو لم يدفع.',
            ]
          : [
              'It is not an advertising slot dressed as editorial. Listings are marked, and a reader can tell a listing from an article.',
              'We do not take a commission on bookings. What a business is paid for a table is what it keeps.',
              'A listing cannot be bought into a place it does not belong. A restaurant is under Eat & Drink whether or not it pays more than the one next to it.',
            ],
      },
      {
        heading: pick(locale, 'What it costs', 'التكلفة'),
        body: [
          TBD('the tiers, what each includes, and the price of each'),
          TBD('the contract length, and what happens at renewal'),
          TBD('the print deadline for the next issue'),
        ],
      },
      {
        heading: pick(locale, 'How to start', 'كيف تبدأ'),
        body: ar
          ? [
              'أرسل لنا اسم العمل وأين هو وجملة عنه. سنعود إليك بما إذا كان مناسباً للدليل وبما يعنيه ذلك.',
              contactEmail('ar'),
              'أو انظر **أضف عملك** لتعرف ما ترسله.',
            ]
          : [
              'Send us the business name, where it is, and a sentence about it. We will come back to you about whether it is right for the directory and what it would involve.',
              contactEmail(),
              'Or see **Add your business** for what to send.',
            ],
      },
    ],
  }
}

// ------------------------------------------------------------------ advertise

export function advertisePage(locale: Locale = 'en'): ContentPage {
  const ar = locale === 'ar'

  return {
    title: pick(locale, 'Advertise with us', 'أعلن معنا'),
    intro: pick(
      locale,
      'Advertising in Vardenia is separate from being listed. A listing describes a place; an advertisement is space in the magazine.',
      'الإعلان في فاردينيا شيء والإدراج شيء آخر. الإدراج يصف مكاناً، والإعلان مساحة في المجلة.',
    ),
    sections: [
      {
        heading: pick(locale, 'Who reads it', 'من يقرأها'),
        body: [
          TBD('the print run, where issues are distributed, and who picks them up'),
          TBD('the audience, in whatever terms we can actually support with evidence'),
        ],
      },
      {
        heading: pick(locale, 'What is available', 'المتاح'),
        body: [
          TBD('the ad formats and sizes, and the price of each'),
          TBD('artwork specifications and the deadline for supplying them'),
          TBD('whether we offer any placement on the website, and if so what'),
        ],
      },
      {
        heading: pick(locale, 'What we will not do', 'ما لن نفعله'),
        body: ar
          ? [
              'الإعلان معلّم كإعلان. لا نكتب مقالاً عن عمل لأنه اشترى صفحة، ولا نترك المعلن يقرر ما يقوله التحرير.',
              'هذه القاعدة تكلفنا مالاً أحياناً، وهي سبب كون المجلة تستحق القراءة.',
            ]
          : [
              'Advertising is marked as advertising. We do not write an article about a business because it bought a page, and we do not let an advertiser choose what the editorial says.',
              'That rule costs us money occasionally and it is the reason the magazine is worth reading.',
            ],
      },
      {
        heading: pick(locale, 'Get in touch', 'تواصل معنا'),
        body: ar
          ? ['أخبرنا بما في بالك ونرسل لك الأسعار الحالية.', contactEmail('ar')]
          : ['Tell us what you have in mind and we will send the current rates.', contactEmail()],
      },
    ],
  }
}

// ----------------------------------------------------- add your business

export function addYourBusinessPage(locale: Locale = 'en'): ContentPage {
  const ar = locale === 'ar'

  return {
    title: pick(locale, 'Add your business', 'أضف عملك'),
    intro: pick(
      locale,
      'Every listing in Vardenia is entered by our team, so this starts with a conversation rather than a form that publishes itself.',
      'كل إدراج في فاردينيا يدخله فريقنا بنفسه، فالبداية محادثة لا استمارة تنشر نفسها.',
    ),
    sections: [
      {
        heading: pick(locale, 'What to send', 'ما ترسله'),
        body: ar
          ? [
              '- اسم العمل وأين هو.',
              '- ما هو: فندق، مطعم، قاعة أعراس، عيادة، خدمة سيارات.',
              '- جملة أو جملتان عمّا يجعله يستحق سهرة زائر.',
              '- موقع إلكتروني أو حساب على مواقع التواصل، إن وُجد.',
              '- وهل تريد أن تستقبل الحجوزات عبر فاردينيا.',
            ]
          : [
              '- The name of the business and where it is.',
              '- What it is: a hotel, a restaurant, a wedding venue, a clinic, a car service.',
              "- A sentence or two about what makes it worth a visitor's evening.",
              '- A website or a social account, if there is one.',
              '- Whether you would want to take bookings through Vardenia.',
            ],
      },
      {
        heading: pick(locale, 'What happens next', 'ماذا يحدث بعدها'),
        body: ar
          ? [
              contactEmail('ar'),
              'ننظر في كل عمل يتواصل معنا. إذا كان مناسباً للدليل نعود إليك بما يتضمنه الإدراج وبتكلفته.',
              'وإذا لم يكن، نقول ذلك بوضوح بدل أن نتركك تنتظر. الدليل لا يساوي شيئاً عند القارئ إلا إذا بقي شيء خارجه.',
              TBD('how long we aim to take to reply'),
            ]
          : [
              contactEmail(),
              'We look at every business that gets in touch. If it is right for the directory we will come back to you with what a listing involves and what it costs.',
              'If it is not, we will say so plainly rather than leaving you waiting. A directory is only worth something to a reader if some things are left out.',
              TBD('how long we aim to take to reply'),
            ],
      },
      {
        heading: pick(locale, 'If you are already listed', 'إذا كنت مدرجاً بالفعل'),
        body: ar
          ? [
              'لتصحيح شيء في إدراج قائم أو لإضافة صور، تواصل معنا ونحدّثه. لا يستطيع أصحاب الأعمال تعديل صفحاتهم بأنفسهم.',
              'وللرد على الحجوزات، سجّل الدخول من **للشركاء**. وإذا لم يُنشأ لك حساب وتريد واحداً، أخبرنا.',
            ]
          : [
              'To correct something on an existing listing, or to add photographs, get in touch and we will update it. Businesses cannot edit their own pages.',
              'To answer bookings, sign in at **For partners**. If you have not been given an account and you want one, say so.',
            ],
      },
    ],
  }
}
