import type { CategorySlug, SiteSection } from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'
import { sectionName, sectionSummary } from './labels'

type Copy = { title: string; description: string }

// Describe the current taxonomy, not unverified prices, availability or rankings.
// Navigation labels stay short; search snippets explain the category and country.
const COPY: Record<CategorySlug, Record<'en' | 'ar', Copy>> = {
  hospitality: {
    en: {
      title: 'Hotels & Getaways in Lebanon',
      description:
        'Explore hotels and getaways in Lebanon. Browse places by location and view accommodation details in the Vardenia directory.',
    },
    ar: {
      title: 'فنادق واستراحات في لبنان',
      description:
        'اكتشف فنادق واستراحات في لبنان. تصفّح الأماكن حسب الموقع واطّلع على تفاصيل الإقامة في دليل فاردينيا.',
    },
  },
  'food-and-beverage': {
    en: {
      title: 'Restaurants, Cafés & Nightlife in Lebanon',
      description:
        'Explore restaurants, cafés, pools and nightlife in Lebanon. Browse places by location and view their details in the Vardenia directory.',
    },
    ar: {
      title: 'مطاعم ومقاهي وحياة ليلية في لبنان',
      description:
        'اكتشف مطاعم ومقاهي ومسابح وأماكن للحياة الليلية في لبنان. تصفّح الأماكن حسب الموقع واطّلع على تفاصيلها في دليل فاردينيا.',
    },
  },
  tourism: {
    en: {
      title: 'Things to Do & Places to Visit in Lebanon',
      description:
        'Explore historic sites, guided tours, festivals and activities in Lebanon. Find places and experiences in the Vardenia directory.',
    },
    ar: {
      title: 'أنشطة وأماكن للزيارة في لبنان',
      description:
        'اكتشف مواقع تاريخية وجولات مع مرشد ومهرجانات وأنشطة في لبنان. تصفّح الأماكن والتجارب في دليل فاردينيا.',
    },
  },
  weddings: {
    en: {
      title: 'Wedding & Event Planners in Lebanon',
      description:
        'Explore wedding and event planners in Lebanon. Browse providers by location and view their details in the Vardenia directory.',
    },
    ar: {
      title: 'منظمو أعراس ومناسبات في لبنان',
      description:
        'اكتشف منظمي أعراس ومناسبات في لبنان. تصفّح مقدمي الخدمات حسب الموقع واطّلع على تفاصيلهم في دليل فاردينيا.',
    },
  },
  lifestyle: {
    en: {
      title: 'Shopping Malls & Gyms in Lebanon',
      description:
        'Explore shopping malls and gyms in Lebanon. Browse places by location and view their details in the Vardenia directory.',
    },
    ar: {
      title: 'مراكز تسوق ونوادٍ رياضية في لبنان',
      description:
        'اكتشف مراكز تسوق ونوادي رياضية في لبنان. تصفّح الأماكن حسب الموقع واطّلع على تفاصيلها في دليل فاردينيا.',
    },
  },
  transportation: {
    en: {
      title: 'Car Rental & Airport Transfers in Lebanon',
      description:
        'Explore car rental, airport transfers and private drivers in Lebanon. Browse transport providers in the Vardenia directory.',
    },
    ar: {
      title: 'تأجير سيارات ونقل من وإلى المطار في لبنان',
      description:
        'اكتشف خدمات تأجير السيارات والنقل من وإلى المطار والسائقين الخاصين في لبنان. تصفّح مقدمي خدمات النقل في دليل فاردينيا.',
    },
  },
}

export function sectionSeoCopy(section: SiteSection, locale: Locale): Copy {
  if (locale === 'en' || locale === 'ar') return COPY[section.category][locale]
  // Keep the existing translated copy for the other supported languages.
  return { title: sectionName(section, locale), description: sectionSummary(section, locale) }
}
