export type ErrorPageLocale = 'en' | 'es';

export function localeFromPathname(pathname: string | null | undefined): ErrorPageLocale {
  const path = (pathname ?? '').split(/[?#]/)[0] || '/';
  return path === '/es' || path.startsWith('/es/') ? 'es' : 'en';
}

export const ERROR_PAGE_COPY = {
  en: {
    globalTitle: 'Something went wrong.',
    globalBody:
      'We have been notified and are looking into it. You can try again, or email help@launchforma.com if it persists.',
    tryAgain: 'Try again',
    wizardTitle: 'The filing wizard stopped.',
    wizardBody:
      'Your draft is saved. Try again, or go back to your dashboard to resume from the last completed step.',
    dashboard: 'Back to dashboard',
    ref: 'Error ref',
  },
  es: {
    globalTitle: 'Algo salió mal.',
    globalBody:
      'Ya nos avisaron y lo estamos revisando. Puedes intentar de nuevo o escribir a help@launchforma.com si sigue pasando.',
    tryAgain: 'Intentar de nuevo',
    wizardTitle: 'El asistente de la solicitud se detuvo.',
    wizardBody:
      'Tu borrador está guardado. Intenta de nuevo o vuelve al panel para seguir desde el último paso.',
    dashboard: 'Volver al panel',
    ref: 'Referencia',
  },
} as const;
