/* FitTimer AI_TEST_MODE fixtures: deterministic answers for FitTimer prompts
   (catalog translation, admin catalog generation, video parsing). Registered with
   the generic AI runtime so lib/ai.js stays free of fitness content. */
const ai = require('./ai');

function fitTestResponder(type, prompt){
  if(type === 'video'){
    return {text:JSON.stringify({isWorkout:false,confidence:.99,reason:'test mode',exercises:[]})};
  }
  if(type !== 'text') return null;
  if(prompt.startsWith('Translate the user-visible fitness text')){
    return {text:JSON.stringify({
      name:'EN Test Program',
      gives:'Complete test program translated for the catalog editor.',
      programName:'EN Test Program',
      programDescription:'Complete test program translated for the catalog editor.',
      exercises:[{index:0,name:'Squats',description:'Controlled movement with a neutral spine.',mistakes:'',replacementName:'',replacementDescription:''}]
    })};
  }
  if(prompt.includes('=== ADMIN CATALOG REQUEST ===')){
    return {text:[
      'ПРОГРАММА: Тестовая программа',
      'ОПИСАНИЕ ПРОГРАММЫ: Полноценная тестовая программа для проверки создания через ИИ в админке.',
      'ПРОГРЕССИЯ: 3',
      'ЧЕРЕДОВАНИЕ: нет',
      'ДЕНЬ: Пн, Ср, Пт',
      'КРУГИ: 3',
      'ОТДЫХ МЕЖДУ КРУГАМИ: 60',
      '',
      'УПРАЖНЕНИЕ: Приседания',
      'ОПИСАНИЕ: Контролируемое движение с нейтральной спиной.',
      'ФОРМАТ: повторения',
      'ЗНАЧЕНИЕ: 12',
      'ПОДХОДЫ: 1',
      'ОТДЫХ: 30'
    ].join('\n')};
  }
  return null;
}

// Unit tests may stub the runtime without the registration hook.
if(typeof ai.registerTestResponder === 'function') ai.registerTestResponder(fitTestResponder);

module.exports = { fitTestResponder };
