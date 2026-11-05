import { useTranslations } from 'next-intl'

/** Embedded result loading, without introducing a second page landmark. */
export function ResultsSkeleton({ kind = 'directory' }: { kind?: 'directory' | 'editorial' }) {
  const t = useTranslations('common')
  const directory = kind === 'directory'
  return (
    <>
      <p role="status" className="sr-only">
        {t('loading')}
      </p>
      <div aria-busy="true" aria-label={t('loading')}>
        <div aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
          {directory ? (
            <>
              <div className="bg-surface-sunken mt-3 h-4 w-32" />
              <div className="mt-8 flex flex-wrap gap-2">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="bg-surface-sunken h-11 w-28" />
                ))}
              </div>
            </>
          ) : null}
          <div
            data-results-kind={kind}
            className={
              directory
                ? 'mt-10 grid grid-cols-2 gap-x-5 gap-y-10 xl:grid-cols-3 xl:gap-x-8'
                : 'mt-10 grid gap-[45px] sm:grid-cols-2 min-[701px]:gap-x-[50px] min-[701px]:gap-y-[65px]'
            }
          >
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className={
                  !directory && index === 0
                    ? 'col-span-full min-[701px]:grid min-[701px]:grid-cols-[1.3fr_1fr] min-[701px]:gap-x-[50px]'
                    : undefined
                }
              >
                <div
                  className={`bg-surface-sunken ${directory ? 'aspect-[4/5]' : 'aspect-[3/2]'}`}
                />
                <div>
                  <div className="bg-surface-sunken mt-4 h-5 w-3/4" />
                  <div className="bg-surface-sunken mt-3 h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
