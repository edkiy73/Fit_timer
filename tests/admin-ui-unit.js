import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile('admin.html','utf8');
const api = await readFile('api/admin.js','utf8');
const sourceWorkflow = await readFile('.github/workflows/source-consistency.yml','utf8');
const smokeWorkflow = await readFile('.github/workflows/admin-smoke.yml','utf8');
const healthApi = await readFile('api/health.js','utf8');
const healthLib = await readFile('lib/health.js','utf8');
const vercelConfig = await readFile('vercel.json','utf8');
const vercelIgnore = await readFile('scripts/vercel-ignore.mjs','utf8');

const need=(ok,msg)=>{if(!ok)throw new Error(msg);};

const script=(html.match(/<script>([\s\S]*?)<\/script>/)||[])[1];
need(script,'admin inline script not found');
new vm.Script(script,{filename:'admin-inline.js'});

need(api.includes("if(a === 'catalog_ai_create')"),'admin AI-create API is missing');
need(api.includes('FitAIProtocol.validateProgramResponse(out.text)'),'AI-created program must be protocol-validated');
need(html.includes('id="fAiCreate"'),'admin AI-create button is missing');
need(html.includes('id="aiCreateDays"'),'admin AI-create form is incomplete');
need(html.includes("api('translate_catalog',{from:lang,to:other"),'AI-create must prepare the second catalog language');

const editStart=html.indexOf('async function aiEditProgram()');
const editEnd=html.indexOf('function renderExerciseCards',editStart);
const editBlock=html.slice(editStart,editEnd);
need(editStart>=0 && !editBlock.includes('prompt('),'AI editing must not use browser prompt()');
need(html.includes('id="fAiEditBox"'),'inline AI edit box is missing');

need(html.includes('let failedMediaJobs = []'),'failed media queue is missing');
need(html.includes("generateMedia('retry')"),'failed media retry action is missing');
need(html.includes('Уже готовые картинки сохранены'),'partial media generation must preserve successes');

need(api.includes("if(a === 'save_draft')"),'server draft save action is missing');
need(api.includes("if(a === 'publish_draft')"),'server draft publish action is missing');
need(api.includes("readItems('c:drafts', 'draft')"),'overview must return server drafts');
need(html.includes('data-tab="dashboard"'),'admin dashboard tab is missing');
need(html.includes('data-tab="drafts"'),'admin drafts tab is missing');
need(html.includes('id="fPublish"'),'explicit publish action is missing from program editor');
need(html.includes("api('save_draft'"),'program editor must save server drafts');
need(html.includes("api('publish_draft'"),'program editor must publish drafts explicitly');
need(html.includes("fetch('/api/health?format=json'"),'dashboard must consume structured health status');
need(html.includes('function moderationState(item)'),'moderation readiness helper is missing');
need(html.includes('class="moderation-actions"'),'pending submissions need direct moderation actions');
need(html.includes('function paymentReadiness('),'payment readiness summary is missing');
need(html.includes('id="editorReviewCard"'),'program editor moderation readiness card is missing');
need(!html.slice(html.indexOf('function renderUsers(b){'),html.indexOf("let campaignLang='ru';")).includes("prompt("),'user Premium actions must not use browser prompt');
need(html.includes('function grantUserPremium('),'user Premium inline action flow is missing');
need(html.includes('data-user-panel'),'user account actions need inline feedback panel');
need(html.includes('function previewCampaign()'),'campaign audience preview is missing');
need(html.includes('campaignPreviewKey'),'campaign send must be invalidated when copy/channels change');
need(api.includes('const preview = !!(body && body.preview)'),'campaign API dry-run is missing');
need(html.includes('Тест текста без сохранения'),'AI settings must clearly test without saving');
need(html.includes("api('test_ai',{type,settings})"),'AI test must send unsaved settings directly');
need(api.includes("body && body.settings ? sanitizeSettings(body.settings)"),'AI test API must use supplied unsaved settings');
need(html.includes('function moderatePendingFromEditor('),'pending program must be publishable from editor after saving edits');
need(html.includes("api('client_error_clear'"),'error screen must support resolving one error group');
need(html.includes('Считать исправленной'),'error screen needs an explicit resolved action');
need(api.includes("if(a === 'client_error_clear')"),'admin API must clear resolved error groups');
need(html.includes("problems.push('Google Play:"),'payment settings must validate impossible provider states');
need(html.includes("el.className='admin-notice "),'admin actions need non-blocking feedback');
need(html.includes('@media(max-width:520px)'),'mobile admin needs narrow-phone layout');
need(vercelConfig.includes('"ignoreCommand": "node scripts/vercel-ignore.mjs"'),'Vercel ignored build step is not configured');
need(vercelIgnore.includes('[skip vercel]') && vercelIgnore.includes('[deploy]'),'Vercel deploy markers are missing');
need(healthApi.includes("format === 'json'"),'health JSON mode is missing');
need(healthLib.includes("store.selfTest()"),'health must actively exercise storage');
need(healthLib.includes("store.list('c:approved')"),'health must probe catalog reads');
need(healthLib.includes("store.list('a:all')"),'health must probe account index reads');

need(sourceWorkflow.includes("'admin.html'"),'admin.html must trigger source consistency CI');
need(smokeWorkflow.includes('node tests/admin-flow.js'),'real admin browser smoke must run in CI');
need(smokeWorkflow.includes('AI_TEST_MODE'),'admin browser smoke must use deterministic AI test mode');

console.log('Admin AI workflow and CI invariants are valid.');
