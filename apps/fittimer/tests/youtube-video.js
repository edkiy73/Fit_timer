const yt = require('../lib/youtube-video');
let bad=0;
const ok=(name,value)=>{if(!value)bad++;console.log((value?'  ok  ':' ПЛОХО')+'  '+name);};
ok('обычная YouTube-ссылка',yt.videoIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')==='dQw4w9WgXcQ');
ok('короткая YouTube-ссылка',yt.videoIdFromUrl('https://youtu.be/dQw4w9WgXcQ?t=5')==='dQw4w9WgXcQ');
ok('не YouTube отклоняется',yt.videoIdFromUrl('https://example.com/watch?v=dQw4w9WgXcQ')==='');
const grounded=yt._test.groundEvidence({isWorkout:true,confidence:.95,exercises:[
  {name:'Приседания',evidence:'Делаем приседания',mechanicsEvidence:'десять повторов, три подхода',format:'reps',value:10,sets:3,restSec:null,warmup:false,warmupEvidence:''}
]},{segments:[{start:12,text:'Делаем приседания десять повторов, три подхода.'}]});
ok('дословное evidence привязывает упражнение',grounded.exercises.length===1&&grounded.exercises[0].value==='10');
const cat=yt._test.groundEvidence({isWorkout:true,confidence:.99,exercises:[
  {name:'Приседания',evidence:'кот прыгает на диван',mechanicsEvidence:'кот прыгает на диван',format:'reps',value:12,sets:3,restSec:30,warmup:false,warmupEvidence:''}
]},{segments:[{start:0,text:'Сегодня кот прыгает на диван и играет с игрушкой.'}]});
ok('обычное движение без механики не получает повторы',cat.exercises[0]&&cat.exercises[0].value===null);
const facts=yt._test.sourceFacts('dQw4w9WgXcQ','Test','transcript',{programDescription:'Короткая тренировка на ноги и корпус.',rounds:1,roundRestSec:0,exercises:[
  {name:'Приседания',description:'Встань устойчиво. Отведи таз назад и присядь. Держи корпус собранным и выдыхай на подъёме. Не своди колени внутрь.',
   muscles:['Квадрицепс','Ягодицы'],mistakes:'Не округляй спину и не своди колени.',startSec:12,format:'reps',value:'10',sets:3,restSec:30,warmup:false}
]});
const C=require('../lib/fit-ai-contract');
const built=yt._test.factsToContract(facts,'ru');
const st=built.program.plans[0].exercises[0].stages[0];
ok('факты собираются в Program DTO V2 без второго вызова ИИ',C.checkOutput('program.create',built,{}).ok===true);
ok('механика скопирована из фактов',st.type==='reps'&&st.value==='10'&&st.sets===3&&st.rest===30&&built.program.plans[0].rounds===1);
ok('есть техника, мышцы и ошибки',/Встань устойчиво/.test(st.desc)&&st.muscles.join()==='le,gl'&&/Не округляй спину/.test(st.mistakes));
ok('импорт видео не включает выдуманную прогрессию',st.progression.mode==='none'&&built.program.progressionEvery===null);
const prog=C.programFromCreate(built,p=>p+Math.random().toString(36).slice(2,6)).program;
ok('ссылка с таймкодом доходит до упражнения',require('../lib/fit-exercise-v2').activePrescription(prog.plans[0].exercises[0]).video==='https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s');
process.exit(bad?1:0);
