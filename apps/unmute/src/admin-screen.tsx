import { AdminPanel } from '@appbase/ui-react/admin.js';
import { sharedUiLocale, useI18n } from '@appbase/ui-react/i18n.js';
import { adminClient } from './admin';
import { contentAdminSection } from './admin-content';
import { courseAdminSection } from './admin-course';
import { updateAdminSection } from './admin-update';

/* Readable names of the analytics events (lib/app-analytics.js) for «Обзор». */
const EVENT_LABELS = {
  ru:{
    install:'Открыли приложение впервые',
    onboarding_done:'Выбрали курс и начали',
    lesson_completed:'Прошли урок',
    day_completed:'Закрыли день курса',
    'paywall_shown.course':'Увидели покупку: на карте курса',
    'paywall_shown.today':'Увидели покупку: на «Сегодня»',
    'paywall_shown.talk':'Увидели покупку: в разговоре с ИИ',
    'paywall_shown.other':'Увидели покупку: в другом месте',
    talk_started:'Начали разговор с ИИ',
    'purchase_started.course':'Нажали «Оплатить»: курс',
    'purchase_started.plus':'Нажали «Оплатить»: Plus',
    'purchase_started.other':'Нажали «Оплатить»: другое',
    'purchase_completed.course':'Купили курс',
    'purchase_completed.plus':'Купили Plus',
    'purchase_completed.other':'Купили другое'
  },
  en:{
    install:'Opened the app for the first time',
    onboarding_done:'Picked a course and started',
    lesson_completed:'Finished a lesson',
    day_completed:'Closed a course day',
    'paywall_shown.course':'Saw the offer: course map',
    'paywall_shown.today':'Saw the offer: Today',
    'paywall_shown.talk':'Saw the offer: AI talk',
    'paywall_shown.other':'Saw the offer: elsewhere',
    talk_started:'Started an AI talk',
    'purchase_started.course':'Pressed Pay: course',
    'purchase_started.plus':'Pressed Pay: Plus',
    'purchase_started.other':'Pressed Pay: other',
    'purchase_completed.course':'Bought a course',
    'purchase_completed.plus':'Bought Plus',
    'purchase_completed.other':'Bought something else'
  }
} as const;

/* Loaded only on #/admin (lazy route in app.tsx), so learners never download the editors. */
export function AdminScreen({productName}: {productName: string}){
  const {locale} = useI18n();
  const adminLocale = sharedUiLocale(locale);
  return <AdminPanel client={adminClient} locale={adminLocale} productName={productName} eventLabels={EVENT_LABELS[adminLocale]} extraSections={[courseAdminSection,contentAdminSection,updateAdminSection]} />;
}
