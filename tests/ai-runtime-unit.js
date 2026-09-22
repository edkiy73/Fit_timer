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
ok('неполное упражнение блокируется', !e2.ok && e2.missing.includes('ЗНАЧЕНИЕ'), JSON.stringify(e2));
const fenced = FitAIProtocol.validateResponse('exercise.replace', '```text\n' + goodExercise + '\n```');
ok('markdown-обёртка снимается безопасно', fenced.ok && !fenced.text.startsWith('```'), fenced.text);
const img = FitAIProtocol.validateResponse('image.exercise', 'data:image/png;base64,iVBORw0KGgo=');
ok('валидный data-url изображения проходит', img.ok, JSON.stringify(img));
const badImg = FitAIProtocol.validateResponse('image.cover', 'https://example.com/x.png');
ok('внешняя ссылка вместо изображения блокируется', !badImg.ok, JSON.stringify(badImg));

process.exit(bad ? 1 : 0);
