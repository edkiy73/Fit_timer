import type { ru } from './ru';

export const en: Record<keyof typeof ru, string> = {
  'app.eyebrow': 'AppBase',
  'app.readyTitle': 'Foundation ready',
  'app.readyText': 'Sign-in, sync, purchases, language, theme, Core, Vercel and tests are already wired.',
  'nav.signIn': 'Sign in',
  'nav.account': 'Account',
  'nav.back': '← Back',
  'account.title': 'Account',
  'account.loading': 'Checking sign-in…',
  'account.synced': 'Manage sign-in and app preferences here.',
  'account.localHint': 'The app works without an account. Sign in with a one-time email code.',
  'account.signOut': 'Sign out',
  'account.language': 'Language',
  'account.languageSystem': 'System language',
  'route.notFoundTitle': 'This page does not exist',
  'route.notFoundText': 'The link is old or has a typo. Go back home.',
  'route.errorTitle': 'Something went wrong',
  'route.errorText': 'This screen did not open. Go home and try again.',
  'route.home': 'Go home'
};
