import { LOCALES } from '@vardenia/i18n'

const otherEditions: readonly string[] = LOCALES.filter((language) => language !== 'en')

export function isEnglishRecovery(pathname: string) {
  return !otherEditions.includes(pathname.split('/')[1] ?? '')
}

/** The standalone documents can render before React or without the usual locale provider. */
export const recoveryEditionScript = `{
  const segment = location.pathname.split('/')[1];
  if (segment === 'en') document.currentScript?.parentElement?.setAttribute('data-english-path', '');
  if (!${JSON.stringify(otherEditions)}.includes(segment))
    document.currentScript?.parentElement?.setAttribute('data-english-recovery', '');
}`
