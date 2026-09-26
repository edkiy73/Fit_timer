/* Семантический diff программ и перенос описательных полей при AI-правке —
   без merge, который раньше принудительно возвращал старую структуру
   (aiMergeProgramEdit/sameProgramShape) и душил обычные запросы вроде
   «поменяй порядок» или «добавь упражнение».

   Запуск:  node tests/ai-protocol-edit-unit.js */

const assert = require('assert');
const FitAIProtocol = require('../lib/ai-protocol');

let bad = 0;
function need(cond, msg){
  if(!cond){ bad++; console.error('FAIL:', msg); }
  else console.log('ok:', msg);
}

/* ---- validateProgramResponse: пустой вариант — это не готовая программа ---- */
{
  const withEmptyVariant = 'ПРОГРАММА: Т\n\nДЕНЬ: \nКРУГИ: 1\nОТДЫХ: 0\n\n'
    + 'ДЕНЬ: \nКРУГИ: 1\nУПРАЖНЕНИЕ: A\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 10\nПОДХОДЫ: 3\nОТДЫХ: 30';
  const v = FitAIProtocol.validateProgramResponse(withEmptyVariant);
  need(v.ok === true && (v.text.match(/^ДЕНЬ:/gm) || []).length === 1,
    'empty variant header is dropped instead of rejecting the whole answer');
}
{
  const allEmpty = 'ПРОГРАММА: Т\n\nДЕНЬ: \nКРУГИ: 1\nОТДЫХ: 0';
  need(FitAIProtocol.validateProgramResponse(allEmpty).ok === false, 'program with no exercises at all is still rejected');
}
/* ---- программа «по кругам» без строк ПОДХОДЫ — не «неполная»: разбор ставит 1 ---- */
{
  const circuit = 'ПРОГРАММА: Т\n\nДЕНЬ: Пн\nКРУГИ: 2\nОТДЫХ МЕЖДУ КРУГАМИ: 60\n\n'
    + 'УПРАЖНЕНИЕ: Приседания\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 15\nОТДЫХ: 30\n\n'
    + 'УПРАЖНЕНИЕ: Отжимания\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 10\nОТДЫХ: 30';
  const v = FitAIProtocol.validateResponse('program.modify', circuit);
  need(v.ok === true, 'circuit program without ПОДХОДЫ passes: ' + v.reason + ' ' + v.missing);
}
/* ---- Markdown-оформление протокола не делает ответ «неполным» ---- */
{
  const md = '```plaintext\n**ПРОГРАММА:** Т\n### ДЕНЬ: Пн\n- КРУГИ: 1\n**УПРАЖНЕНИЕ**: Присед\n'
    + 'ОПИСАНИЕ: Стопы на ширине плеч: колени по носкам.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 10\nПОДХОДЫ: 3\nОТДЫХ: 60\n```';
  const v = FitAIProtocol.validateResponse('program.modify', md);
  need(v.ok === true, 'markdown-decorated protocol passes: ' + v.reason + ' ' + v.missing);
  need(/^ПРОГРАММА: Т$/m.test(v.text) && /^УПРАЖНЕНИЕ: Присед$/m.test(v.text), 'labels are cleaned for the client parser');
  need(v.text.includes('Стопы на ширине плеч: колени по носкам.'), 'description text with a colon is left untouched');
}
{
  const good = 'ПРОГРАММА: Т\n\nДЕНЬ: \nКРУГИ: 1\nУПРАЖНЕНИЕ: A\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 10\nПОДХОДЫ: 3\nОТДЫХ: 30';
  need(FitAIProtocol.validateProgramResponse(good).ok === true, 'well-formed single-variant program passes');
}

/* ---- ШАГ ВЕСА без ПОТОЛОК ВЕСА: новые упражнения/программы (*.create)
   обязаны прийти с потолком; правки (*.modify) — нет, иначе обычная узкая
   правка старого упражнения без потолка отклонялась бы ---- */
{
  const block = 'УПРАЖНЕНИЕ: Жим гантелей\nФОРМАТ: повторения и вес\nЗНАЧЕНИЕ: 10\nВЕС: 0\nПОДХОДЫ: 3\nОТДЫХ: 60\nУСЛОЖНЯТЬ: да\nШАГ ВЕСА: 2';
  const v = FitAIProtocol.validateResponse('exercise.create', block);
  need(v.ok === false && v.missing.some(m => /ПОТОЛОК ВЕСА/.test(m)), 'new exercise with growing weight and no ceiling is rejected');
  need(FitAIProtocol.validateResponse('exercise.modify', block).ok === true, 'edit of an old exercise without a ceiling is NOT rejected');
}
{
  const block = 'УПРАЖНЕНИЕ: Жим гантелей\nФОРМАТ: повторения и вес\nЗНАЧЕНИЕ: 10\nВЕС: 0\nПОДХОДЫ: 3\nОТДЫХ: 60\nУСЛОЖНЯТЬ: да\nШАГ ВЕСА: 2\nПОТОЛОК ВЕСА: 24';
  need(FitAIProtocol.validateResponse('exercise.create', block).ok === true, 'new exercise with a ceiling passes, even at ВЕС: 0 (not yet chosen)');
}
{
  const block = 'УПРАЖНЕНИЕ: Присед\nФОРМАТ: повторения и вес\nЗНАЧЕНИЕ: 10\nВЕС: 20\nПОДХОДЫ: 3\nОТДЫХ: 60\nУСЛОЖНЯТЬ: да\nШАГ ПОВТОРОВ: 1\nШАГ ВЕСА: 0';
  need(FitAIProtocol.validateResponse('exercise.create', block).ok === true, 'ШАГ ВЕСА: 0 (axis intentionally not growing) needs no ceiling');
}
{
  const prog = 'ПРОГРАММА: Т\n\nДЕНЬ: \nКРУГИ: 1\n\nУПРАЖНЕНИЕ: Присед\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 10\nПОДХОДЫ: 3\nОТДЫХ: 60\n\n'
    + 'УПРАЖНЕНИЕ: Жим гантелей\nФОРМАТ: повторения и вес\nЗНАЧЕНИЕ: 10\nВЕС: 8\nПОДХОДЫ: 3\nОТДЫХ: 60\nШАГ ВЕСА: 2';
  need(FitAIProtocol.validateResponse('program.create', prog).ok === false, 'new program: one exercise missing the ceiling fails the response');
  need(FitAIProtocol.validateResponse('program.modify', prog).ok === true, 'program edit keeping an old ceiling-less exercise passes');
}

/* ---- carryExerciseFields: ответ ИИ используется как есть, добавляются только
   недостающие описательные поля из исходника ---- */
{
  const src = 'УПРАЖНЕНИЕ: Присед\nОПИСАНИЕ: старое описание\nМЫШЦЫ: Ягодицы\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 12\nПОДХОДЫ: 3\nОТДЫХ: 60';
  const cand = 'УПРАЖНЕНИЕ: Присед с гантелями\nФОРМАТ: повторения и вес\nЗНАЧЕНИЕ: 10\nВЕС: 8\nПОДХОДЫ: 3\nОТДЫХ: 60';
  const out = FitAIProtocol.carryExerciseFields(src, cand);
  need(out.includes('ОПИСАНИЕ: старое описание'), 'missing ОПИСАНИЕ is carried from source');
  need(out.includes('МЫШЦЫ: Ягодицы'), 'missing МЫШЦЫ is carried from source');
  need(out.includes('ВЕС: 8') && out.includes('УПРАЖНЕНИЕ: Присед с гантелями'), 'candidate fields are kept as-is');
}
{
  const src = 'УПРАЖНЕНИЕ: Присед\nОПИСАНИЕ: старое\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 12\nПОДХОДЫ: 3\nОТДЫХ: 60';
  const cand = 'УПРАЖНЕНИЕ: Присед\nОПИСАНИЕ: новое\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 14\nПОДХОДЫ: 3\nОТДЫХ: 60';
  const out = FitAIProtocol.carryExerciseFields(src, cand);
  need(out.includes('ОПИСАНИЕ: новое') && !out.includes('старое'), 'existing candidate field is never overridden');
}

/* ---- diffPrograms: сопоставление по id/КОД/имени, added/removed/moved ---- */
const ex = (id, name) => ({id, name});
const prog = plans => ({plans});

{
  // Переименование того же движения (АИ переслал КОД старого упражнения) —
  // не считается добавлением/удалением, старое → новое сопоставлено напрямую.
  const oldP = prog([{exercises: [ex('e1', 'Присед'), ex('e2', 'Отжимания')]}]);
  const newP = prog([{exercises: [
    {id: 'n1', name: 'Отжимания от пола', _code: 'e2'},
    {id: 'n2', name: 'Присед', _code: 'e1'}
  ]}]);
  const d = FitAIProtocol.diffPrograms(oldP, newP);
  need(d.added.length === 0 && d.removed.length === 0, 'rename via КОД matches, no add/remove');
  need(d.matches.length === 2, 'both exercises matched');
  need(d.moved === 1, 'one exercise out of its old relative order: ' + d.moved);
  const m = d.matches.find(x => x.oldEx.id === 'e2');
  need(!!m && m.newEx.name === 'Отжимания от пола', 'match carries the renamed exercise');
}

{
  // Замена одного упражнения на новое + удаление другого — раньше оба случая
  // либо ломали разбор, либо тихо игнорировались.
  const oldP = prog([{exercises: [ex('e1', 'Присед'), ex('e2', 'Отжимания'), ex('e3', 'Выпады'), ex('e4', 'Планка')]}]);
  const newP = prog([{exercises: [
    {id: 'n1', name: 'Присед', _code: 'e1'},
    {id: 'n2', name: 'Отжимания', _code: 'e2'},
    {id: 'n3', name: 'Планка', _code: 'e4'},
    {id: 'n4', name: 'Скручивания'}
  ]}]);
  const d = FitAIProtocol.diffPrograms(oldP, newP);
  need(d.removed.length === 1 && d.removed[0].name === 'Выпады', 'dropped exercise is reported as removed');
  need(d.added.length === 1 && d.added[0].name === 'Скручивания', 'new exercise is reported as added');
  need(d.moved === 0, 'remaining exercises kept their relative order');
}

{
  // Чистая перестановка без КОД — сопоставление по точному имени.
  const oldP = prog([{exercises: [ex('e1', 'Присед'), ex('e2', 'Отжимания'), ex('e3', 'Выпады'), ex('e4', 'Планка')]}]);
  const newP = prog([{exercises: [
    {id: 'n1', name: 'Отжимания'}, {id: 'n2', name: 'Присед'}, {id: 'n3', name: 'Выпады'}, {id: 'n4', name: 'Планка'}
  ]}]);
  const d = FitAIProtocol.diffPrograms(oldP, newP);
  need(d.added.length === 0 && d.removed.length === 0, 'pure reorder matches everything by name');
  need(d.moved === 1, 'adjacent swap counts as one move: ' + d.moved);
}

if(bad){
  console.error('\nFailed:', bad);
  process.exit(1);
}
console.log('\nAI edit protocol: ok');
