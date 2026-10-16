import { getTranslations } from 'next-intl/server'
import { formatDate, type Locale } from '@vardenia/i18n'
import type { Article } from '../../lib/articles'
import { Link } from '../../i18n/routing'
import { Plate } from '../ui'

export async function HomeStories({ articles, locale }: { articles: Article[]; locale: Locale }) {
  if (!articles.length) return null
  const t = await getTranslations('homeFinish')
  const home = await getTranslations('home')
  return (
    <section className="vd-home-stories" aria-labelledby="vd-stories-title">
      <header className="vd-home-heading">
        <div>
          <h2 id="vd-stories-title" data-vd-reveal>
            {t('storiesTitle')}
          </h2>
          <p data-vd-reveal>{t('storiesBody')}</p>
        </div>
        <Link className="vd-text-link" href="/magazine/articles">
          {home('allArticles')} ↗
        </Link>
      </header>
      <div className="vd-home-story-grid" data-count={articles.length}>
        {articles.map((article, index) => (
          <article key={article.id} className="vd-home-story" data-vd-reveal>
            <Link href={`/magazine/articles/${article.slug}`}>
              <Plate
                image={article.heroImage as never}
                ratio="hero"
                interactive
                sizes={
                  index === 0 ? '(max-width:700px) 100vw, 55vw' : '(max-width:700px) 100vw, 45vw'
                }
              />
              <div>
                <h3 dir="auto">{article.title}</h3>
                {article.excerpt && <p dir="auto">{article.excerpt}</p>}
                {article.publishedAt && (
                  <time dateTime={article.publishedAt}>
                    {formatDate(new Date(article.publishedAt), locale)}
                  </time>
                )}
                <span className="vd-text-link">{t('readStory')} ↗</span>
              </div>
            </Link>
          </article>
        ))}
      </div>
    </section>
  )
}
