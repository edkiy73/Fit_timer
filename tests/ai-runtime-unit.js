/* AI protocol/runtime regression without external providers. */
const FitAIProtocol = require('../lib/ai-protocol');

let bad = 0;
const ok = (name, cond, extra) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra == null ? '' : ' → ' + extra));
};

const goodProgram = ['ПРОГРАММА: Тест','ДЕНЬ: Пн','КРУГИ: 1','ОТДЫХ МЕЖДУ КРУГАМИ: 10','','УПРАЖНЕНИЕ: Приседания','ФОРМАТ: повторения','ЗНАЧЕНИЕ: 10','ПОДХОДЫ: 2','ОТДЫХ: 30'].join('\n');
const badProgram = ['ПРОГРАММА: Тест','ДЕНЬ: Пн','КРУГИ: 1','УПРАЖНЕНИЕ: Приседания'].join('\n');
const goodExercise = ['УПРАЖНЕНИЕ: Планка','ФОРМАТ: время','ЗНАЧЕНИЕ: 30','ПОДХОДЫ: 1','ОТДЫХ: 20'].join('\n');
const badExercise = ['УПРАЖНЕНИЕ: Планка','ФОРМАТ: время'].join('\n');

const p1 = FitAIProtocol.validateResponse('program.create', goodProgram);
ok('валидная программа проходит', p1.ok, JSON.stringify(p1));
const p2 = FitAIProtocol.validateResponse('program.modify', badProgram);
ok('обрезанная программа блокируется', !p2.ok && p2.missing.includes('ФОРМАТ'), JSON.stringify(p2));
const e1 = FitAIProtocol.validateResponse('exercise.create', goodExercise);
ok('валидное упражнение проходит', e1.ok, JSON.stringify(e1));
const e2 = FitAIProtocol.validateResponse('exercise.modify', badExercise);
ok('неполное упражнение блокируется', !e2.ok && e2.missing.some(x=>x.endsWith(':ЗНАЧЕНИЕ')), JSON.stringify(e2));
const multiExercise = goodExercise + '\n\n' + goodExercise.replace('Планка','Боковая планка');
const multiCreate = FitAIProtocol.validateResponse('exercise.create', multiExercise);
ok('создание нескольких упражнений разрешено', multiCreate.ok && multiCreate.count === 2, JSON.stringify(multiCreate));
const multiModify = FitAIProtocol.validateResponse('exercise.modify', multiExercise);
ok('правка упражнения остаётся строго одиночной', !multiModify.ok && multiModify.reason === 'exercise_count', JSON.stringify(multiModify));
const fenced = FitAIProtocol.validateResponse('exercise.replace', '```text\n' + goodExercise + '\n```');
ok('markdown-обёртка снимается безопасно', fenced.ok && !fenced.text.startsWith('```'), fenced.text);
const img = FitAIProtocol.validateResponse('image.exercise', 'data:image/png;base64,iVBORw0KGgo=');
ok('валидный data-url изображения проходит', img.ok, JSON.stringify(img));
const badImg = FitAIProtocol.validateResponse('image.cover', 'https://example.com/x.png');
ok('внешняя ссылка вместо изображения блокируется', !badImg.ok, JSON.stringify(badImg));

(async()=>{
  process.env.GEMINI_API_KEY = 'unit';
  process.env.OPENAI_API_KEY = 'unit';
  process.env.AI_TEXT_TIMEOUT_MS = '60';
  const { generate } = require('../lib/ai');
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
      validate:x=>FitAIProtocol.validateResponse('program.create', x.text)
    });
    ok('невалидный HTTP 200 у primary уходит на backup',
       out.fallback === true && out.provider === 'openai' && out.text === goodProgram && calls === 2,
       JSON.stringify({fallback:out.fallback,provider:out.provider,calls}));
  }catch(e){
    ok('fallback-тест не падает', false, e && e.message);
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
