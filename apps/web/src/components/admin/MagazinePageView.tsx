import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { notFound, redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import { isStaffUser } from '../../access'
import { MagazinePageEditor } from './magazine-page/MagazinePageEditor'

export function MagazinePageView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult
  if (!req.user) redirect('/admin/login?redirect=%2Fadmin%2Fmagazine-page')
  if (!isStaffUser(req.user)) notFound()

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={req.user}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <MagazinePageEditor />
      </Gutter>
    </DefaultTemplate>
  )
}
