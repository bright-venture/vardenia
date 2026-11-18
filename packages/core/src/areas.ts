/**
 * The areas guests actually look for (18 November 2026): neighbourhoods in
 * Beirut (Achrafieh, Gemmayzeh) and towns elsewhere (Jounieh, Faraya). They
 * replace districts in the directory's Filters, because "Keserwan inside
 * Keserwan" tells a traveller nothing and "Faraya" does.
 *
 * This is the starting list. The areas live in the Areas collection, where the
 * team can add, rename or reorder them without code; the room types migration
 * style seed (migration 20261118_areas) copies this list in once.
 */
export interface AreaSeed {
  slug: string
  en: string
  ar: string
  /** The Vardenia region it belongs to, a slug from GOVERNORATES. */
  governorate: string
}

export const AREA_SEED: readonly AreaSeed[] = [
  // Beirut
  { slug: 'achrafieh', en: 'Achrafieh', ar: 'الأشرفية', governorate: 'beirut' },
  { slug: 'gemmayzeh', en: 'Gemmayzeh', ar: 'الجميزة', governorate: 'beirut' },
  { slug: 'mar-mikhael', en: 'Mar Mikhael', ar: 'مار مخايل', governorate: 'beirut' },
  { slug: 'downtown-beirut', en: 'Downtown', ar: 'وسط بيروت', governorate: 'beirut' },
  { slug: 'saifi', en: 'Saifi', ar: 'الصيفي', governorate: 'beirut' },
  { slug: 'hamra', en: 'Hamra', ar: 'الحمرا', governorate: 'beirut' },
  { slug: 'ras-beirut', en: 'Ras Beirut', ar: 'رأس بيروت', governorate: 'beirut' },
  { slug: 'raouche', en: 'Raouche', ar: 'الروشة', governorate: 'beirut' },
  { slug: 'ain-el-mreisseh', en: 'Ain el-Mreisseh', ar: 'عين المريسة', governorate: 'beirut' },
  { slug: 'verdun', en: 'Verdun', ar: 'فردان', governorate: 'beirut' },
  { slug: 'badaro', en: 'Badaro', ar: 'بدارو', governorate: 'beirut' },
  { slug: 'mazraa', en: 'Mazraa', ar: 'المزرعة', governorate: 'beirut' },
  // Matn (Aley, Baabda and Matn districts)
  { slug: 'broummana', en: 'Broummana', ar: 'برمانا', governorate: 'matn' },
  { slug: 'beit-mery', en: 'Beit Mery', ar: 'بيت مري', governorate: 'matn' },
  { slug: 'bikfaya', en: 'Bikfaya', ar: 'بكفيا', governorate: 'matn' },
  { slug: 'dbayeh', en: 'Dbayeh', ar: 'ضبية', governorate: 'matn' },
  { slug: 'jal-el-dib', en: 'Jal el-Dib', ar: 'جل الديب', governorate: 'matn' },
  { slug: 'antelias', en: 'Antelias', ar: 'انطلياس', governorate: 'matn' },
  { slug: 'sin-el-fil', en: 'Sin el-Fil', ar: 'سن الفيل', governorate: 'matn' },
  { slug: 'hazmieh', en: 'Hazmieh', ar: 'الحازمية', governorate: 'matn' },
  { slug: 'baabda', en: 'Baabda', ar: 'بعبدا', governorate: 'matn' },
  { slug: 'aley', en: 'Aley', ar: 'عاليه', governorate: 'matn' },
  { slug: 'bhamdoun', en: 'Bhamdoun', ar: 'بحمدون', governorate: 'matn' },
  { slug: 'sawfar', en: 'Sawfar', ar: 'صوفر', governorate: 'matn' },
  // Keserwan (Keserwan and Jbeil districts)
  { slug: 'jounieh', en: 'Jounieh', ar: 'جونية', governorate: 'keserwan' },
  { slug: 'kaslik', en: 'Kaslik', ar: 'الكسليك', governorate: 'keserwan' },
  { slug: 'harissa', en: 'Harissa', ar: 'حريصا', governorate: 'keserwan' },
  { slug: 'faraya', en: 'Faraya', ar: 'فاريا', governorate: 'keserwan' },
  { slug: 'faqra', en: 'Faqra', ar: 'فقرا', governorate: 'keserwan' },
  { slug: 'kfardebian', en: 'Kfardebian', ar: 'كفرذبيان', governorate: 'keserwan' },
  { slug: 'ajaltoun', en: 'Ajaltoun', ar: 'عجلتون', governorate: 'keserwan' },
  { slug: 'tabarja', en: 'Tabarja', ar: 'طبرجا', governorate: 'keserwan' },
  { slug: 'byblos', en: 'Byblos (Jbeil)', ar: 'جبيل', governorate: 'keserwan' },
  { slug: 'amchit', en: 'Amchit', ar: 'عمشيت', governorate: 'keserwan' },
  // North
  { slug: 'batroun', en: 'Batroun', ar: 'البترون', governorate: 'north-lebanon' },
  { slug: 'douma', en: 'Douma', ar: 'دوما', governorate: 'north-lebanon' },
  { slug: 'tripoli', en: 'Tripoli', ar: 'طرابلس', governorate: 'north-lebanon' },
  { slug: 'bsharri', en: 'Bsharri', ar: 'بشري', governorate: 'north-lebanon' },
  { slug: 'the-cedars', en: 'The Cedars', ar: 'الأرز', governorate: 'north-lebanon' },
  { slug: 'ehden', en: 'Ehden', ar: 'إهدن', governorate: 'north-lebanon' },
  { slug: 'chekka', en: 'Chekka', ar: 'شكا', governorate: 'north-lebanon' },
  { slug: 'anfeh', en: 'Anfeh', ar: 'أنفه', governorate: 'north-lebanon' },
  { slug: 'amioun', en: 'Amioun', ar: 'أميون', governorate: 'north-lebanon' },
  { slug: 'halba', en: 'Halba', ar: 'حلبا', governorate: 'north-lebanon' },
  // Chouf
  { slug: 'deir-el-qamar', en: 'Deir el-Qamar', ar: 'دير القمر', governorate: 'chouf' },
  { slug: 'beiteddine', en: 'Beiteddine', ar: 'بيت الدين', governorate: 'chouf' },
  { slug: 'baakline', en: 'Baakline', ar: 'بعقلين', governorate: 'chouf' },
  { slug: 'barouk', en: 'Barouk', ar: 'الباروك', governorate: 'chouf' },
  { slug: 'maasser-el-chouf', en: 'Maasser el-Chouf', ar: 'معاصر الشوف', governorate: 'chouf' },
  { slug: 'moukhtara', en: 'Moukhtara', ar: 'المختارة', governorate: 'chouf' },
  { slug: 'damour', en: 'Damour', ar: 'الدامور', governorate: 'chouf' },
  { slug: 'jiyeh', en: 'Jiyeh', ar: 'الجية', governorate: 'chouf' },
  // Bekaa
  { slug: 'zahle', en: 'Zahle', ar: 'زحلة', governorate: 'beqaa' },
  { slug: 'ksara', en: 'Ksara', ar: 'كسارة', governorate: 'beqaa' },
  { slug: 'chtaura', en: 'Chtaura', ar: 'شتورة', governorate: 'beqaa' },
  { slug: 'anjar', en: 'Anjar', ar: 'عنجر', governorate: 'beqaa' },
  { slug: 'kefraya', en: 'Kefraya', ar: 'كفريا', governorate: 'beqaa' },
  { slug: 'ammiq', en: 'Ammiq', ar: 'عميق', governorate: 'beqaa' },
  { slug: 'baalbek', en: 'Baalbek', ar: 'بعلبك', governorate: 'beqaa' },
  { slug: 'hermel', en: 'Hermel', ar: 'الهرمل', governorate: 'beqaa' },
  { slug: 'rashaya', en: 'Rashaya', ar: 'راشيا', governorate: 'beqaa' },
  // South
  { slug: 'sidon', en: 'Sidon (Saida)', ar: 'صيدا', governorate: 'south-lebanon' },
  { slug: 'tyre', en: 'Tyre (Sour)', ar: 'صور', governorate: 'south-lebanon' },
  { slug: 'jezzine', en: 'Jezzine', ar: 'جزين', governorate: 'south-lebanon' },
  { slug: 'nabatieh', en: 'Nabatieh', ar: 'النبطية', governorate: 'south-lebanon' },
  { slug: 'naqoura', en: 'Naqoura', ar: 'الناقورة', governorate: 'south-lebanon' },
  { slug: 'marjeyoun', en: 'Marjeyoun', ar: 'مرجعيون', governorate: 'south-lebanon' },
]

/** An area slug: lowercase words joined by hyphens. */
export const AREA_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
