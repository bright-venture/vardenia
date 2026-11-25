import { getTranslations } from 'next-intl/server'
import { LINKTREE_URL } from '../../lib/contact'
import { AnnouncementBar, type Announcement } from './AnnouncementBar'

/**
 * The messages of the strip above the header, in the reader's language. To
 * add, remove or reorder one, change this list (and its text in the messages
 * files, `announce`).
 */
export async function SiteAnnouncements() {
  const t = await getTranslations('announce')
  const items: Announcement[] = [
    { text: t('followUs'), href: LINKTREE_URL, external: true },
    { text: t('allLinks'), href: LINKTREE_URL, external: true },
    { text: t('newIssue'), href: '/magazine/issues' },
  ]
  return (
    <AnnouncementBar
      items={items}
      label={t('label')}
      previousLabel={t('previous')}
      nextLabel={t('next')}
    />
  )
}
