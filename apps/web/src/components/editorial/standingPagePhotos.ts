import type { Locale } from '@vardenia/i18n'

/**
 * The standing pages' own photographs, shared by the page headers
 * (ContentPage) and the About menu (SiteHeader), so a page and its menu row
 * always show the same picture.
 */

/**
 * About's header picture: the seven regional editions as doors, the issue in
 * front. The About menu shows it beside the "About Vardenia" row too.
 */
export const ABOUT_HERO = { src: '/about/seven-doors.webp', width: 999, height: 1280 }
export const ABOUT_HERO_ALT: Record<Locale, string> = {
  en: 'The All Lebanon issue of Vardenia on a lit plinth, before seven doorways opening onto Beirut, Metn, Keserwan, the North, the Chouf, the Beqaa and the South',
  ar: 'عدد كلّ لبنان من فاردينيا على منصّة مضاءة، أمام سبعة أبواب تطلّ على بيروت والمتن وكسروان والشمال والشوف والبقاع والجنوب',
  fr: 'L’édition All Lebanon de Vardenia sur un socle éclairé, devant sept portes ouvertes sur Beyrouth, le Metn, le Kesrouan, le Nord, le Chouf, la Békaa et le Sud',
  es: 'La edición All Lebanon de Vardenia sobre un pedestal iluminado, ante siete puertas abiertas a Beirut, Metn, Keserwan, el Norte, Chouf, Bekaa y el Sur',
  pt: 'A edição All Lebanon da Vardenia num pedestal iluminado, diante de sete portas abertas para Beirute, Metn, Keserwan, o Norte, Chouf, Bekaa e o Sul',
  ru: 'Выпуск All Lebanon журнала Vardenia на освещённом постаменте перед семью дверями в Бейрут, Метн, Кесруан, Север, Шуф, Бекаа и Юг',
  zh: 'Vardenia All Lebanon 期杂志立在一座亮灯的底座上，身后是通往贝鲁特、迈特恩、凯斯鲁万、北部、舒夫、贝卡和南部的七扇门',
  hi: 'रोशन चबूतरे पर Vardenia का All Lebanon अंक, पीछे बेरूत, मेत्न, केसरवान, उत्तर, शूफ़, बेक़ा और दक्षिण की ओर खुलते सात दरवाज़े',
  bn: 'আলোকিত বেদিতে Vardenia-র All Lebanon সংখ্যা, পেছনে বৈরুত, মেতন, কেসরওয়ান, উত্তর, শুফ, বেকা ও দক্ষিণের দিকে খোলা সাতটি দরজা',
  ur: 'روشن چبوترے پر Vardenia کا All Lebanon شمارہ، پیچھے بیروت، متن، کسروان، شمال، شوف، بقاع اور جنوب کی طرف کھلتے سات دروازے',
}

/**
 * Add your business's own photograph (the owner's, 11 November 2026): a woman
 * at a terrace table above the sea, adding her business to Vardenia on a
 * laptop. The page header shows it beside the title, and the About menu shows
 * it beside the "Add your business" row. Portrait, so both show it whole.
 */
export const ADD_BUSINESS_PHOTO = {
  src: '/add-your-business/introduce-your-business.webp',
  width: 1024,
  height: 1280,
}

export const ADD_BUSINESS_PHOTO_ALT: Record<Locale, string> = {
  en: 'A woman at a stone terrace above the sea at sunset, adding her business to Vardenia on a laptop, with postcards of Lebanon on the table',
  ar: 'امرأة على شرفة حجرية تطلّ على البحر عند الغروب، تضيف عملها إلى فاردينيا على حاسوبها، وعلى الطاولة بطاقات بريدية من لبنان',
  fr: 'Une femme sur une terrasse de pierre au-dessus de la mer au coucher du soleil, ajoutant son établissement à Vardenia sur un ordinateur portable, des cartes postales du Liban sur la table',
  es: 'Una mujer en una terraza de piedra sobre el mar al atardecer, añadiendo su negocio a Vardenia en un portátil, con postales del Líbano sobre la mesa',
  pt: 'Uma mulher num terraço de pedra sobre o mar ao pôr do sol, adicionando seu negócio à Vardenia num notebook, com cartões-postais do Líbano na mesa',
  ru: 'Женщина на каменной террасе над морем на закате добавляет своё заведение в Vardenia на ноутбуке, на столе открытки с видами Ливана',
  zh: '日落时分，一位女士坐在临海的石砌露台上，用笔记本电脑把她的商户添加到 Vardenia，桌上摆着黎巴嫩的明信片',
  hi: 'सूर्यास्त के समय समुद्र के ऊपर पत्थर की छत पर एक महिला लैपटॉप पर अपना व्यवसाय Vardenia में जोड़ रही है, मेज़ पर लेबनान के पोस्टकार्ड',
  bn: 'সূর্যাস্তে সমুদ্রের ওপরে পাথরের বারান্দায় একজন নারী ল্যাপটপে Vardenia-তে নিজের ব্যবসা যোগ করছেন, টেবিলে লেবাননের পোস্টকার্ড',
  ur: 'غروبِ آفتاب کے وقت سمندر کے اوپر پتھر کی چھت پر ایک خاتون لیپ ٹاپ پر اپنا کاروبار Vardenia میں شامل کر رہی ہیں، میز پر لبنان کے پوسٹ کارڈ',
}
