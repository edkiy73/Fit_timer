// «A1: первые шаги» — a small second course (3 days) used to exercise several courses,
// the course switcher and course purchase end to end. Every English word must already be
// in the shared lexicon: publishing refuses missing or ambiguous surfaces.

export const A1_STARTER_ID='a1-starter';
export const A1_STARTER_SKU='course.'+A1_STARTER_ID;

const base={revision:1,revisionProgress:'preserve',lexiconRefs:[]};
const answer=(...accepted)=>({accepted,nearMiss:true,caseSensitive:false});

function choice(id,tags,prompt,options,correctIndex,explanation){
  return {...base,id,type:'choice',tags,prompt,options,correctIndex,explanation};
}

function drill(id,tags,pattern,pairs){
  return {...base,id,type:'pattern-drill',tags,pattern,modes:['drill','listening','speaking'],
    items:pairs.map(([prompt,itemAnswer],index)=>({id:id+'.item-'+(index+1),prompt,answer:itemAnswer}))};
}

function day1(){
  const tag='a1-day-1';
  return [
    {...base,id:'plan.a1-day-1',type:'theory',tags:['plan'],title:{ru:'День 1',en:'Day 1'},format:'text',
      body:{
        ru:'Представься вслух: скажи, как тебя зовут и что тебе приятно познакомиться.\n\n• Hi, I am Anna.\n• My name is Anna.\n• Nice to meet you.',
        en:'Say out loud who you are. Then say: nice to meet you.\n\n• Hi, I am Anna.\n• My name is Anna.\n• Nice to meet you.'
      }},
    {...base,id:'a1.theory.hello',type:'theory',tags:[tag],title:{ru:'Привет и знакомство',en:'Hi and your name'},format:'html',
      body:{
        ru:'<p><b>Hi</b> — привет, здравствуй.</p><p><b>I am</b> (коротко <b>I\'m</b>) — я. <b>My name is</b> — меня зовут.</p><p><b>Nice to meet you</b> — приятно познакомиться.</p>',
        en:'<p><b>Hi</b> — say it first.</p><p><b>I am</b> (short: <b>I\'m</b>) and <b>My name is</b> — to say your name.</p><p><b>Nice to meet you</b> — when you meet someone.</p>'
      }},
    choice('a1.ex.hello.1',[tag],{ru:'Как сказать «Меня зовут Анна»?',en:'Choose the right answer.'},
      [{ru:'My name is Anna.'},{ru:'My name Anna.'},{ru:'I name is Anna.'}],0,
      {ru:'После «My name» нужен глагол «is»: My name is Anna.',en:'«My name» + «is»: My name is Anna.'}),
    choice('a1.ex.hello.2',[tag],{ru:'Что ответить на «Nice to meet you»?',en:'Choose the answer to «Nice to meet you».'},
      [{ru:'Nice to meet you too.'},{ru:'I am fine.'},{ru:'Good night.'}],0,
      {ru:'На «приятно познакомиться» отвечают тем же и добавляют «too» — тоже.',en:'Say the same, then say «too».'}),
    {...base,id:'a1.ex.hello.3',type:'translation',tags:[tag],direction:'to-target',prompt:{ru:'Я Анна.',en:'I am Anna.'},
      answer:answer('I am Anna','I\'m Anna'),
      explanation:{ru:'«Я» — это I am, в разговоре коротко I\'m.',en:'I am, short: I\'m.'}},
    drill('a1.pattern.hello',[tag],{ru:'I am … / My name is …',en:'I am … / My name is …'},[
      [{ru:'Я Анна.',en:'I am Anna.'},answer('I am Anna','I\'m Anna')],
      [{ru:'Меня зовут Анна.',en:'My name is Anna.'},answer('My name is Anna')],
      [{ru:'Приятно познакомиться.',en:'Nice to meet you.'},answer('Nice to meet you')]
    ])
  ];
}

function day2(){
  const tag='a1-day-2';
  return [
    {...base,id:'plan.a1-day-2',type:'theory',tags:['plan'],title:{ru:'День 2',en:'Day 2'},format:'text',
      body:{
        ru:'Расскажи вслух, откуда ты и где сейчас живёшь.\n\n• I am from Russia.\n• I live in Dubai.\n• Where are you from?',
        en:'Say out loud where you are from and where you live now.\n\n• I am from Russia.\n• I live in Dubai.\n• Where are you from?'
      }},
    {...base,id:'a1.theory.from',type:'theory',tags:[tag],title:{ru:'Откуда ты',en:'Where you are from'},format:'html',
      body:{
        ru:'<p><b>Where are you from?</b> — откуда ты?</p><p><b>I am from</b> Russia — я из России.</p><p><b>I live in</b> Dubai — я живу в Дубае. После <b>live</b> идёт <b>in</b>.</p>',
        en:'<p><b>Where are you from?</b></p><p><b>I am from</b> Russia.</p><p><b>I live in</b> Dubai. After <b>live</b> we say <b>in</b>.</p>'
      }},
    choice('a1.ex.from.1',[tag],{ru:'Как спросить «Откуда ты?»',en:'Choose the right question.'},
      [{ru:'Where are you from?'},{ru:'Where you are from?'},{ru:'Where is you from?'}],0,
      {ru:'В вопросе «are» идёт перед «you»: Where are you from?',en:'In a question «are» is before «you».'}),
    choice('a1.ex.from.2',[tag],{ru:'Выбери: «Я живу в Дубае».',en:'Choose the right answer.'},
      [{ru:'I live in Dubai.'},{ru:'I live Dubai.'},{ru:'I am live in Dubai.'}],0,
      {ru:'После «live» нужен предлог «in», а «am» здесь лишний.',en:'Say «live in», without «am».'}),
    {...base,id:'a1.ex.from.3',type:'translation',tags:[tag],direction:'to-target',prompt:{ru:'Я из России.',en:'I am from Russia.'},
      answer:answer('I am from Russia','I\'m from Russia'),
      explanation:{ru:'«Из» — from: I am from Russia.',en:'Use «from»: I am from Russia.'}},
    drill('a1.pattern.from',[tag],{ru:'I am from … / I live in …',en:'I am from … / I live in …'},[
      [{ru:'Я из России.',en:'I am from Russia.'},answer('I am from Russia','I\'m from Russia')],
      [{ru:'Я живу в Дубае.',en:'I live in Dubai.'},answer('I live in Dubai')],
      [{ru:'Откуда ты?',en:'Where are you from?'},answer('Where are you from')]
    ])
  ];
}

function day3(){
  const tag='a1-day-3';
  return [
    {...base,id:'plan.a1-day-3',type:'theory',tags:['plan'],title:{ru:'День 3',en:'Day 3'},format:'text',
      body:{
        ru:'Закажи вслух кофе или воду и поблагодари.\n\n• Can I have a coffee, please?\n• Water, please.\n• Thank you.',
        en:'Ask for a coffee or water out loud. Then say thank you.\n\n• Can I have a coffee, please?\n• Water, please.\n• Thank you.'
      }},
    {...base,id:'a1.theory.cafe',type:'theory',tags:[tag],title:{ru:'В кафе',en:'At the cafe'},format:'html',
      body:{
        ru:'<p><b>Can I have</b> a coffee, <b>please</b>? — можно мне кофе?</p><p>Короче: <b>Water, please.</b></p><p><b>Thank you</b> — спасибо.</p>',
        en:'<p><b>Can I have</b> a coffee, <b>please</b>?</p><p>Short: <b>Water, please.</b></p><p><b>Thank you.</b></p>'
      }},
    choice('a1.ex.cafe.1',[tag],{ru:'Как вежливо попросить кофе?',en:'Choose the polite way to ask.'},
      [{ru:'Can I have a coffee, please?'},{ru:'Give coffee.'},{ru:'I coffee.'}],0,
      {ru:'«Can I have…, please?» — вежливая просьба, подходит везде.',en:'«Can I have…, please?» is polite.'}),
    choice('a1.ex.cafe.2',[tag],{ru:'Что сказать, когда тебе дали заказ?',en:'What do you say when you get your coffee?'},
      [{ru:'Thank you.'},{ru:'Please.'},{ru:'Good night.'}],0,
      {ru:'«Thank you» — спасибо. «Please» — это «пожалуйста» в просьбе.',en:'«Thank you» after you get it; «please» when you ask.'}),
    {...base,id:'a1.ex.cafe.3',type:'translation',tags:[tag],direction:'to-target',prompt:{ru:'Воду, пожалуйста.',en:'Water, please.'},
      answer:answer('Water, please','Water please','A water, please'),
      explanation:{ru:'Коротко: название + please.',en:'Short: the thing + please.'}},
    {...base,id:'a1.dialogue.cafe',type:'dialogue',tags:['dialogue'],scene:{ru:'Кофе с собой',en:'A coffee to go'},
      lines:[
        {id:'a1.dialogue.cafe.line-1',partner:{ru:'Hi! What can I get you?'},task:{ru:'Попроси кофе',en:'Ask for a coffee'},
          answer:answer('Can I have a coffee, please','A coffee, please','Can I have a coffee please','A coffee please'),displayAnswer:'Can I have a coffee, please?'},
        {id:'a1.dialogue.cafe.line-2',partner:{ru:'Here you are.'},task:{ru:'Поблагодари',en:'Say thank you'},
          answer:answer('Thank you','Thanks'),displayAnswer:'Thank you.'}
      ]}
  ];
}

export function buildA1StarterCourse(){
  const days=[day1(),day2(),day3()];
  const activities=days.flat();
  const nodes=days.map((items,index)=>({
    id:'a1-day-'+(index+1),kind:'lesson',title:{ru:'День '+(index+1),en:'Day '+(index+1)},
    dayIndex:index+1,order:index,prerequisites:index?['a1-day-'+index]:[],
    activityIds:items.map(item=>item.id),optional:false
  }));
  return {
    schemaVersion:1,
    id:A1_STARTER_ID,
    revision:1,
    slug:A1_STARTER_ID,
    title:{ru:'A1: первые шаги',en:'A1: First steps'},
    description:{ru:'Три коротких дня: знакомство, откуда ты, заказ в кафе.',en:'Three short days: hello, where you are from, ordering at a cafe.'},
    level:{from:'a1',to:'a1',labels:['A1']},
    access:{mode:'entitlement',entitlement:A1_STARTER_SKU,
      freePreview:{kind:'first-days',days:1,learnedContentStaysAvailable:true}},
    defaultRoadmapId:'main',
    roadmaps:[{id:'main',title:{ru:'Путь',en:'Path'},nodes}],
    activities,
    resources:[]
  };
}
