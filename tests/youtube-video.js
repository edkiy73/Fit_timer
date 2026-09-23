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
const facts=yt._test.sourceFacts('dQw4w9WgXcQ','Test','transcript',{rounds:1,roundRestSec:0,exercises:[
  {name:'Squat',startSec:12,format:'reps',value:'10',sets:3,restSec:30,warmup:false}
]});
const protocol=['ПРОГРАММА: Test','ДЕНЬ:','КРУГИ: 1','ОТДЫХ МЕЖДУ КРУГАМИ: 0','','УПРАЖНЕНИЕ: Приседания',
'ФОРМАТ: повторения','ЗНАЧЕНИЕ: 10','ПОДХОДЫ: 3','ОТДЫХ: 30','ВИДЕО: https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s'].join('\n');
ok('неизменная механика проходит',yt._test.validateFinalProgram(protocol,facts).ok===true);
ok('изменённые повторы блокируются',yt._test.validateFinalProgram(protocol.replace('ЗНАЧЕНИЕ: 10','ЗНАЧЕНИЕ: 15'),facts).ok===false);
process.exit(bad?1:0);
