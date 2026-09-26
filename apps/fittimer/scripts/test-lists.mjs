/* Списки тестов для scripts/test.mjs и scripts/run-browser-tests.mjs.
   Новый tests/*.js добавляй сюда (или в BROWSER_TESTS) — иначе
   run-browser-tests.mjs сообщит, что тест нигде не запускается. */

// Unit- и серверные тесты. Все идут против одного tests/dev-server.js
// (ADMIN_KEY, GEMINI_API_KEY=test, AI_TEST_MODE=1 — без внешних сервисов).
// Сами тесты запускаются без этих переменных (ai-runtime-unit проверяет
// настоящие провайдеры через заглушки), кроме UNIT_TESTS_WITH_TEST_ENV.
export const UNIT_TESTS = [
  'sync-api', 'auth-abuse', 'ai-runtime-unit', 'infrastructure-adapters-unit', 'supabase-shadow-unit',
  'admin-core-observability-unit', 'admin-core-accounts-unit', 'admin-core-campaigns-unit',
  'admin-core-ai-settings-unit', 'admin-core-release-unit',
  'admin-fittimer-catalog-text-unit', 'admin-fittimer-catalog-images-unit', 'admin-fittimer-catalog-crud-unit',
  'appbase-ui-core-unit', 'appbase-ui-adoption-unit', 'appbase-ui-modals-unit', 'appbase-ui-brand-unit',
  'appbase-ui-states-unit', 'appbase-core-bundle-unit', 'capabilities-unit', 'app-module-graph-unit',
  'push-unit', 'analytics-unit', 'analytics-api', 'diagnostics-unit', 'health-unit', 'update-settings-unit',
  'onboarding-funnel-unit', 'ai-recovery-unit', 'ai-generation-guards-unit', 'motivation-unit',
  'accessibility-unit', 'release-ux-unit', 'admin-ui-unit', 'vercel-ignore-unit', 'ai-protocol-edit-unit',
  'progression-per-exercise-unit', 'admin-ai-api'
];

export const UNIT_TESTS_WITH_TEST_ENV = ['admin-ai-api'];

// Браузерный smoke админки.
export const ADMIN_TESTS = ['admin-flow'];

// Статические проверки, запускаемые как node-скрипты (не как npm-скрипты).
export const STATIC_TESTS = ['appbase-foundation-unit'];
