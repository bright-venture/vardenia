import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { isLocale } from '@vardenia/i18n'
import { findPageBySlug } from '../../../../../lib/pages'

/**
 * A standing site page: About, Advertise, Privacy, Terms.
 *
 * One template for all of them. The words live in the CMS, so correcting a
 * privacy policy is an edit and a save rather than a code change, a review and a
 * deploy - which matters because the people who own that text cannot open a code
 * editor.
 *
 * Rendered on demand rather than statically generated. These pages are read
 * rarely and change at short notice, usually on legal advice, and waiting for a
 * rebuild is the wrong trade for a document that has to be correct now.
 */

interface Params {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}

  const page = await findPageBySlug(slug, locale)
  if (!page) return {}

  const seo = (page.seo ?? {}) as {
    title?: string | null
    description?: string | null
    noIndex?: boolean | null
  }

  return {
    title: seo.title || page.title,
    description: seo.description || undefined,
    // Terms and privacy drafts have no business in search results.
    robots: seo.noIndex ? { index: false, follow: false } : undefined,
    alternates: {
      canonical: `/pages/${slug}`,
      languages: { en: `/pages/${slug}`, ar: `/ar/pages/${slug}` },
    },
  }
}

export default async function SitePage({ params }: Params) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const page = await findPageBySlug(slug, locale)
  if (!page) notFound()

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-ink-900 text-4xl leading-tight md:text-5xl">{page.title}</h1>

      {page.body ? (
        <div className="prose prose-lg text-ink-700 mt-10 max-w-none">
          <RichText data={page.body as never} />
        </div>
      ) : (
        <p className="text-ink-500 mt-10 text-sm">
          {locale === 'ar' ? 'لا يوجد محتوى بعد.' : 'This page has no content yet.'}
        </p>
      )}
    </main>
  )
}
