// Addressing the learner in the past tense needs both forms: «Ты вчера работал(а)?».
// Only verbs that follow «ты» in the same sentence change; first-person examples
// («Я видел его») and third-person ones («Кто тебе звонил?») stay as they are.

const VERBS = [
  'работал','закончил','сказал','звонил','позвонил','пробовал','планировал','решал',
  'делал','сделал','устал','проверил','посмотрел','замолчал','просил','написал','был','видел',
  'говорил','думал','знал','хотел','забыл','купил','нашёл','пошёл','пришёл','ушёл','ошибся'
];
// Irregular stems: «пошёл» → «пошёл (пошла)».
const IRREGULAR = {'нашёл':'нашла','пошёл':'пошла','пришёл':'пришла','ушёл':'ушла','ошибся':'ошиблась'};

const PATTERN = new RegExp(
  '(^|[^а-яё])(ты)([^.?!…·\\n«»]{0,40}?\\s)(' + VERBS.join('|') + ')(?![а-яё(]|\\s\\()',
  'gi'
);

export function neutralizeRu(text){
  if(typeof text !== 'string' || !/ты/i.test(text)) return text;
  return text.replace(PATTERN, (all, before, you, middle, verb) => {
    const lower = verb.toLowerCase();
    const feminine = IRREGULAR[lower];
    return before + you + middle + (feminine ? verb + ' (' + feminine + ')' : verb + '(а)');
  });
}

/** Returns a copy of the course with learner-addressed past tense in both forms, plus the list of changes. */
export function neutralizeCourse(set){
  const changes = [];
  const walk = (value, owner) => {
    if(Array.isArray(value)) return value.map(item => walk(item, owner));
    if(!value || typeof value !== 'object') return value;
    const out = {};
    for(const [key, child] of Object.entries(value)){
      if(key === 'ru' && typeof child === 'string'){
        const next = neutralizeRu(child);
        if(next !== child) changes.push({id:owner, before:child, after:next});
        out[key] = next;
      }else{
        out[key] = walk(child, owner);
      }
    }
    return out;
  };
  const activities = (set.activities || []).map(activity => walk(activity, activity.id));
  const roadmaps = (set.roadmaps || []).map(roadmap => walk(roadmap, 'roadmap:' + roadmap.id));
  return {set:{...set, activities, roadmaps}, changes};
}
