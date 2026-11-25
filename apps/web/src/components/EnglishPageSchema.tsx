import { JsonLd } from './JsonLd'

type Props = {
  locale: string
  path: string
  name: string
  description?: string
  type?: 'CollectionPage' | 'AboutPage' | 'ContactPage' | 'WebPage'
}

/** Use only public, server-rendered content. Private account and booking flows are excluded. */
export function EnglishPageSchema({ locale, path, name, description, type = 'WebPage' }: Props) {
  if (locale !== 'en') return null
  const url = new URL(path, process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').href
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': type,
        url,
        name,
        description,
        inLanguage: 'en',
        publisher: { '@type': 'Organization', name: 'Vardenia' },
      }}
    />
  )
}
