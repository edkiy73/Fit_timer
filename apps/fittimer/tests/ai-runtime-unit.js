/* AI protocol/runtime regression without external providers. */
const {createAIActionRegistry} = require('../../../packages/core/server/ai-action-registry');
const {registry: FitAIActions, validateImage} = require('../lib/fit-ai-actions');

let bad = 0;
const ok = (name, cond, extra) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra == null ? '' : ' → ' + extra));
};

const demoRegistry = createAIActionRegistry([
  {id:'demo.echo',type:'text',bucket:'light'},
  {id:'demo.image',type:'image',bucket:'image',aspectRatio:'1:1'}
]);
ok('generic AI registry accepts non-fitness action ids',
  demoRegistry.has('demo.echo') && demoRegistry.get('demo.echo').bucket === 'light');
ok('generic AI registry normalizes image actions without FitTimer knowledge',
  demoRegistry.get('demo.image').type === 'image' && demoRegistry.get('demo.image').aspectRatio === '1:1');
ok('FitTimer actions are registered outside generic registry',
  FitAIActions.has('program.create') && FitAIActions.has('video.parse') && FitAIActions.has('image.exercise'));

// Four long, different workout days are independent, short provider responses.
const Contract = require('../lib/fit-ai-contract');
const fixture = require('../lib/fit-ai-test-fixtures').fitTestResponder;
const splitInput = Contract.normalizeInput('program.create', {
  language:'Russian', task:'Build four different 45+ minute days, with warmups.',
  scheduleDays:['mon','tue','thu','sat'], splitByDays:true
}).input;
const splitAction = FitAIActions.get('program.create');
const splitParts = [];
for(let index=0; index<splitInput.scheduleDays.length; index++){
  const body = {contractVersion:2,input:splitInput,segment:{id:'abcdefghijklmnop-123',index}};
  const batch = splitAction.batch(body);
  const prompt = splitAction.buildPrompt({body});
  const mocked = fixture('text', prompt, {schema:splitAction.schema});
  const part = mocked && JSON.parse(mocked.text);
  ok('day '+(index+1)+' has a valid standalone contract and expected day',
    batch.index === index && batch.days.length === 4
    && !!part && Contract.checkSegment(part,splitInput.scheduleDays[index]).ok);
  splitParts.push(part);
}
const combined = Contract.mergeSegments(splitParts,splitInput.scheduleDays);
ok('four segments merge into four distinct scheduled daily workouts',
  !combined.errors.length && combined.json.program.plans.length === 4
  && combined.json.program.plans.every((p,i)=>p.days[0]===splitInput.scheduleDays[i])
  && new Set(combined.json.program.plans.map(p=>p.exercises[1].stages[0].name)).size===4);
const missingDay = Contract.mergeSegments(splitParts.slice(0,3),splitInput.scheduleDays);
ok('incomplete weekly program cannot be saved', missingDay.errors.length > 0);
ok('invalid continuation index rejected before provider call', (() => {
  try{ splitAction.batch({contractVersion:2,input:splitInput,
    segment:{id:'abcdefghijklmnop-123',index:4}}); return false; }catch(_){return true;}
})());

// Проверка ответа в generate — любая функция действия; здесь простой JSON-валидатор
const goodProgram = JSON.stringify({contractVersion:2, program:{name:'Тест'}});
const badProgram = JSON.stringify({contractVersion:2});
const validProgram = text => { try{ const j = JSON.parse(text); return j && j.program ? {ok:true} : {ok:false, reason:'missing_fields', missing:['program']}; }catch(_){ return {ok:false, reason:'malformed_response', missing:[]}; } };
const img = validateImage({image:'data:image/png;base64,iVBORw0KGgo='});
ok('валидный data-url изображения проходит', img.ok, JSON.stringify(img));
const badImg = validateImage({image:'https://example.com/x.png'});
ok('внешняя ссылка вместо изображения блокируется', !badImg.ok, JSON.stringify(badImg));

(async()=>{
  process.env.GEMINI_API_KEY = 'unit';
  process.env.OPENAI_API_KEY = 'unit';
  process.env.OPENROUTER_API_KEY = 'unit';
  process.env.AI_TEXT_TIMEOUT_MS = '60';
  const { generate, sanitizeSettings, providerStatus } = require('../../../packages/core/server/ai');
  const sanitized = sanitizeSettings({
    text:{primary:{provider:'openrouter',model:'openrouter/test'},backup:{provider:'gemini',model:'gemini-test'}},
    image:{primary:{provider:'openrouter',model:'should-not-stick'},backup:{provider:'openai',model:'img'}}
  });
  ok('OpenRouter разрешён только для text route',
    sanitized.text.primary.provider === 'openrouter' && sanitized.image.primary.provider === 'gemini',
    JSON.stringify({text:sanitized.text.primary,image:sanitized.image.primary}));
  ok('providerStatus видит OpenRouter env', providerStatus().openrouter === true);

  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    if(String(url).includes('generativelanguage.googleapis.com')){
      return {
        ok:true,status:200,
        json:async()=>({candidates:[{content:{parts:[{text:badProgram}]}}]})
      };
    }
    return {
      ok:true,status:200,
      json:async()=>({output_text:goodProgram})
    };
  };
  try{
    const settings = {
      text:{
        primary:{provider:'gemini',model:'primary-test'},
        backup:{provider:'openai',model:'backup-test'}
      },
      image:{primary:{provider:'gemini',model:'img-a'},backup:{provider:'openai',model:'img-b'},size:'1K'}
    };
    const out = await generate('text', settings, 'prompt', {
      validate:x=>validProgram(x.text)
    });
    ok('невалидный HTTP 200 у primary уходит на backup',
       out.fallback === true && out.provider === 'openai' && out.text === goodProgram && calls === 2,
       JSON.stringify({fallback:out.fallback,provider:out.provider,calls}));
  }catch(e){
    ok('fallback-тест не падает', false, e && e.message);
  }finally{
    global.fetch = originalFetch;
  }
  calls = 0;
  global.fetch = async (url, opts) => {
    calls++;
    if(String(url).includes('openrouter.ai')){
      const body=JSON.parse(String(opts.body||'{}'));
      return {
        ok:true,status:200,
        json:async()=>({choices:[{message:{content:goodProgram}}],usage:{prompt_tokens:10,completion_tokens:20}})
      };
    }
    throw new Error('unexpected provider');
  };
  try{
    const out = await generate('text', {
      text:{primary:{provider:'openrouter',model:'demo/model'},backup:{provider:'openrouter',model:'demo/model'}},
      image:{primary:{provider:'gemini',model:'img-a'},backup:{provider:'openai',model:'img-b'},size:'1K'}
    }, 'prompt', {validate:x=>validProgram(x.text)});
    ok('OpenRouter adapter работает через общий AI runtime',
      out.provider === 'openrouter' && out.text === goodProgram && calls === 1,
      JSON.stringify({provider:out.provider,calls}));
  }catch(e){
    ok('OpenRouter runtime test не падает', false, e && e.message);
  }finally{
    global.fetch = originalFetch;
  }

  // провайдер не успел: вместо английского «This operation was aborted» —
  // понятный код ai_timeout, по которому приложение пишет по-русски
  global.fetch = (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), {name:'AbortError'})));
  });
  try{
    const same = {provider:'gemini', model:'slow'};
    await generate('text', {text:{primary:same, backup:same}}, 'prompt', {});
    ok('медленный провайдер даёт ai_timeout', false, 'no error');
  }catch(e){
    ok('медленный провайдер даёт ai_timeout', e && e.code === 'ai_timeout' && e.status === 504, e && (e.code + ' ' + e.message));
  }finally{
    global.fetch = originalFetch;
  }
  process.exit(bad ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
