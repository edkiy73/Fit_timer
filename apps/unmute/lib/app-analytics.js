'use strict';
const { store } = require('../../../packages/core/server/store');
const { createAnalyticsEngine } = require('../../../packages/core/server/analytics-core');

const EVENTS = Object.freeze([
  'install',
  'onboarding_done',
  // Legacy unsuffixed events stay readable in historical analytics.
  'lesson_completed',
  'day_completed',
  'lesson_completed.first',
  'lesson_completed.resume',
  'lesson_completed.replay',
  'day_completed.first',
  'day_completed.resume',
  'day_completed.replay',
  'paywall_shown.course',
  'paywall_shown.today',
  'paywall_shown.talk',
  'paywall_shown.other',
  'talk_started',
  'purchase_started.course',
  'purchase_started.plus',
  'purchase_started.other',
  'purchase_completed.course',
  'purchase_completed.plus',
  'purchase_completed.other',
  'purchase_started.bundle',
  'purchase_completed.bundle',
  // Inside a day and the ways back (launch plan, stage 3, item 14; audit R7).
  'day_started',
  'course_day.1',
  'course_day.3',
  'course_day.7',
  'section_completed.tasks',
  'section_completed.drill',
  'section_completed.listening',
  'section_completed.speaking',
  'section_completed.dialogue',
  'section_completed.ai',
  'review_completed',
  'word_saved',
  'reminder_enabled',
  'signed_in',
  'ai_error',
  'save_error'
]);
/* Admin «Воронка»: installs → onboarding → day 1 → account → day 3 → paywall → purchase. */
const FUNNEL = Object.freeze([
  {id:'install', events:['install']},
  {id:'onboarding_done', events:['onboarding_done']},
  {id:'course_day.1', events:['course_day.1']},
  {id:'signed_in', events:['signed_in']},
  {id:'course_day.3', events:['course_day.3']},
  {id:'paywall', events:['paywall_shown.course','paywall_shown.today','paywall_shown.talk','paywall_shown.other']},
  {id:'purchase', events:['purchase_completed.course','purchase_completed.bundle','purchase_completed.plus','purchase_completed.other']}
]);
const engine = createAnalyticsEngine({store, events:EVENTS, funnel:FUNNEL});

module.exports = {
  EVENTS,
  FUNNEL,
  recordAnalytics: engine.recordAnalytics,
  removeAnalyticsDevice: engine.removeAnalyticsDevice,
  analyticsStats: engine.analyticsStats
};
