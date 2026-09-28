import type { ru } from './ru';

export const en: Record<keyof typeof ru, string> = {
  'app.eyebrow': 'AppBase',
  'app.readyTitle': 'Foundation ready',
  'app.readyText': 'Sign-in, sync, purchases, language, theme, Core, Vercel and tests are already wired.',
  'nav.signIn': 'Sign in',
  'nav.account': 'Account',
  'nav.back': '← Back',
  'account.title': 'Account',
  'account.synced': 'Settings sync between devices where you are signed in.',
  'account.localHint': 'The app works without an account. Sign in to have your data on every device.',
  'account.signOut': 'Sign out',
  'account.language': 'Language',
  'account.languageSystem': 'System language'
};
