import { DEFAULT_TERMS } from './legal-terms';
import { AdminPanel } from '@appbase/ui-react/admin.js';
import { sharedUiLocale, useI18n } from '@appbase/ui-react/i18n.js';
import { adminClient } from './admin';
import { contentAdminSection } from './admin-content';
import { courseAdminSection } from './admin-course';
import { updateAdminSection } from './admin-update';
import { referralAdminSection } from './admin-referral';

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
    'purchase_completed.other':'Купили другое',
    'lesson_completed.first':'Прошли урок впервые',
    'lesson_completed.resume':'Закончили урок после перерыва',
    'lesson_completed.replay':'Прошли урок ещё раз',
    'day_completed.first':'Закрыли день курса впервые',
    'day_completed.resume':'Закрыли день после перерыва',
    'day_completed.replay':'Прошли день ещё раз',
    'purchase_started.bundle':'Нажали «Оплатить»: курс + Plus',
    'purchase_completed.bundle':'Купили курс + Plus',
    day_started:'Начали новый день курса',
    'course_day.1':'Прошли день 1',
    'course_day.3':'Прошли день 3',
    'course_day.7':'Прошли день 7',
    'section_completed.tasks':'Раздел пройден: задания',
    'section_completed.drill':'Раздел пройден: на скорость',
    'section_completed.listening':'Раздел пройден: слушание',
    'section_completed.speaking':'Раздел пройден: говорение',
    'section_completed.dialogue':'Раздел пройден: диалог',
    'section_completed.ai':'Раздел пройден: разговор с ИИ',
    review_completed:'Прошли «Повтор»',
    word_saved:'Сохранили слово',
    reminder_enabled:'Включили напоминание',
    signed_in:'Вошли в аккаунт',
    ai_error:'Ошибка ИИ',
    save_error:'Не сохранился прогресс',
    paywall:'Увидели покупку',
    purchase:'Купили'
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
    'purchase_completed.other':'Bought something else',
    'lesson_completed.first':'Finished a lesson for the first time',
    'lesson_completed.resume':'Finished a lesson after a break',
    'lesson_completed.replay':'Replayed a lesson',
    'day_completed.first':'Closed a course day for the first time',
    'day_completed.resume':'Closed a day after a break',
    'day_completed.replay':'Replayed a day',
    'purchase_started.bundle':'Pressed Pay: course + Plus',
    'purchase_completed.bundle':'Bought course + Plus',
    day_started:'Started a new course day',
    'course_day.1':'Passed day 1',
    'course_day.3':'Passed day 3',
    'course_day.7':'Passed day 7',
    'section_completed.tasks':'Section done: tasks',
    'section_completed.drill':'Section done: speed',
    'section_completed.listening':'Section done: listening',
    'section_completed.speaking':'Section done: speaking',
    'section_completed.dialogue':'Section done: dialogue',
    'section_completed.ai':'Section done: AI talk',
    review_completed:'Finished Review',
    word_saved:'Saved a word',
    reminder_enabled:'Turned on a reminder',
    signed_in:'Signed in',
    ai_error:'AI error',
    save_error:'Progress not saved',
    paywall:'Saw the offer',
    purchase:'Bought'
  }
} as const;

/* Loaded only on #/admin (lazy route in app.tsx), so learners never download the editors. */
export function AdminScreen({productName}: {productName: string}){
  const {locale} = useI18n();
  const adminLocale = sharedUiLocale(locale);
  return <AdminPanel client={adminClient} locale={adminLocale} productName={productName} eventLabels={EVENT_LABELS[adminLocale]} extraSections={[courseAdminSection,contentAdminSection,referralAdminSection,updateAdminSection]} defaultTerms={DEFAULT_TERMS} />;
}
