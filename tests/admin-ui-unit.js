import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile('admin.html','utf8');
const api = await readFile('api/admin.js','utf8');
const sourceWorkflow = await readFile('.github/workflows/source-consistency.yml','utf8');
const smokeWorkflow = await readFile('.github/workflows/admin-smoke.yml','utf8');

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

need(sourceWorkflow.includes("'admin.html'"),'admin.html must trigger source consistency CI');
need(smokeWorkflow.includes('node tests/admin-flow.js'),'real admin browser smoke must run in CI');
need(smokeWorkflow.includes('AI_TEST_MODE'),'admin browser smoke must use deterministic AI test mode');

console.log('Admin AI workflow and CI invariants are valid.');
