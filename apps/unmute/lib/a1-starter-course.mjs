// «A1: первые шаги» — a 12-day starter course for real beginners; it is also the second
// course that exercises the course switcher and course purchase end to end. Every English word must already be
// in the shared lexicon: publishing refuses missing or ambiguous surfaces.

export const A1_STARTER_ID='a1-starter';
export const A1_STARTER_SKU='course.'+A1_STARTER_ID;

const base={revision:1,revisionProgress:'preserve',lexiconRefs:[]};
const answer=(...accepted)=>({accepted,nearMiss:true,caseSensitive:false});

function choice(id,tags,prompt,options,correctIndex,explanation){
  return {...base,id,type:'choice',tags,prompt,options,correctIndex,explanation};
}

function sentenceBuilder(id,tags,prompt,accepted,explanation){
  return {...base,id,type:'text-input',tags,prompt,responseMode:'progressive',
    answer:answer(...accepted),explanation};
}

function drill(id,tags,pattern,pairs){
  return {...base,id,type:'pattern-drill',tags,pattern,modes:['drill','listening','speaking'],
    items:pairs.map(([prompt,itemAnswer,explanation],index)=>({id:id+'.item-'+(index+1),prompt,answer:itemAnswer,...(explanation?{explanation}:{})}))};
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
    sentenceBuilder('a1.ex.hello.1',[tag],{ru:'Собери: «Меня зовут Анна».',en:'Build: “My name is Anna.”'},
      ['My name is Anna'],
      {ru:'После «My name» нужен глагол «is»: My name is Anna.',en:'«My name» + «is»: My name is Anna.'}),
    choice('a1.ex.hello.2',[tag],{ru:'Что ответить на «Nice to meet you»?',en:'Choose the answer to «Nice to meet you».'},
      [{ru:'Nice to meet you too.'},{ru:'I am fine.'},{ru:'Good night.'}],0,
      {ru:'На «приятно познакомиться» отвечают тем же и добавляют «too» — тоже.',en:'Say the same, then say «too».'}),
    {...base,id:'a1.ex.hello.3',type:'translation',tags:[tag],direction:'to-target',responseMode:'write',prompt:{ru:'Я Анна.',en:'I am Anna.'},
      answer:answer('I am Anna','I\'m Anna'),
      explanation:{ru:'«Я» — это I am, в разговоре коротко I\'m.',en:'I am, short: I\'m.'}},
    drill('a1.pattern.hello',[tag],{ru:'I am … / My name is …',en:'I am … / My name is …'},[
      [{ru:'Я Анна.',en:'I am Anna.'},answer('I am Anna','I\'m Anna'),{ru:'«Я» по-английски — I am, коротко I\'m. Без am фраза не работает.',en:'Say I am (short: I\'m), not just I.'}],
      [{ru:'Меня зовут Анна.',en:'My name is Anna.'},answer('My name is Anna'),{ru:'Дословно «моё имя есть Анна»: после My name нужен is.',en:'My name + is + your name.'}],
      [{ru:'Приятно познакомиться.',en:'Nice to meet you.'},answer('Nice to meet you'),{ru:'Устойчивая фраза при знакомстве — произноси её целиком.',en:'Say it as a whole when you meet someone.'}]
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
    sentenceBuilder('a1.ex.from.1',[tag],{ru:'Собери: «Откуда ты?»',en:'Build: “Where are you from?”'},
      ['Where are you from'],
      {ru:'В вопросе «are» идёт перед «you»: Where are you from?',en:'In a question «are» is before «you».'}),
    choice('a1.ex.from.2',[tag],{ru:'Выбери: «Я живу в Дубае».',en:'Choose the right answer.'},
      [{ru:'I live in Dubai.'},{ru:'I live Dubai.'},{ru:'I am live in Dubai.'}],0,
      {ru:'После «live» нужен предлог «in», а «am» здесь лишний.',en:'Say «live in», without «am».'}),
    {...base,id:'a1.ex.from.3',type:'translation',tags:[tag],direction:'to-target',responseMode:'write',prompt:{ru:'Я из России.',en:'I am from Russia.'},
      answer:answer('I am from Russia','I\'m from Russia'),
      explanation:{ru:'«Из» — from: I am from Russia.',en:'Use «from»: I am from Russia.'}},
    drill('a1.pattern.from',[tag],{ru:'I am from … / I live in …',en:'I am from … / I live in …'},[
      [{ru:'Я из России.',en:'I am from Russia.'},answer('I am from Russia','I\'m from Russia'),{ru:'«Из» — from, а перед ним снова I am.',en:'Use I am + from.'}],
      [{ru:'Я живу в Дубае.',en:'I live in Dubai.'},answer('I live in Dubai'),{ru:'Live — это действие, поэтому am не нужен. После live идёт in.',en:'Say live in, without am.'}],
      [{ru:'Откуда ты?',en:'Where are you from?'},answer('Where are you from'),{ru:'В вопросе are стоит перед you, а from — в конце.',en:'In a question are is before you; from is at the end.'}]
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
    sentenceBuilder('a1.ex.cafe.1',[tag],{ru:'Собери вежливую просьбу о кофе.',en:'Build a polite request for coffee.'},
      ['Can I have a coffee, please','Can I have a coffee please'],
      {ru:'«Can I have…, please?» — вежливая просьба, подходит везде.',en:'«Can I have…, please?» is polite.'}),
    choice('a1.ex.cafe.2',[tag],{ru:'Что сказать, когда тебе дали заказ?',en:'What do you say when you get your coffee?'},
      [{ru:'Thank you.'},{ru:'Please.'},{ru:'Good night.'}],0,
      {ru:'«Thank you» — спасибо. «Please» — это «пожалуйста» в просьбе.',en:'«Thank you» after you get it; «please» when you ask.'}),
    {...base,id:'a1.ex.cafe.3',type:'translation',tags:[tag],direction:'to-target',responseMode:'write',prompt:{ru:'Воду, пожалуйста.',en:'Water, please.'},
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

// Days 4+ share one shape: a plan note, a short rule, two choices, one translation,
// a phrase drill and sometimes a dialogue. Every graded item explains the answer.
function day(n,{key,plan,title,body,choices,translation,pattern,pairs,dialogue}){
  const tag='a1-day-'+n;
  const items=[
    {...base,id:'plan.a1-day-'+n,type:'theory',tags:['plan'],title:{ru:'День '+n,en:'Day '+n},format:'text',body:plan},
    {...base,id:'a1.theory.'+key,type:'theory',tags:[tag],title,format:'html',body},
    ...choices.map((item,index)=>index===0
      ? sentenceBuilder('a1.ex.'+key+'.1',[tag],item.prompt,[item.options[0]],item.explanation)
      : choice('a1.ex.'+key+'.'+(index+1),[tag],item.prompt,item.options.map(ru=>({ru})),0,item.explanation)),
    {...base,id:'a1.ex.'+key+'.'+(choices.length+1),type:'translation',tags:[tag],direction:'to-target',responseMode:'write',
      prompt:translation.prompt,answer:answer(...translation.answers),explanation:translation.explanation},
    drill('a1.pattern.'+key,[tag],pattern,pairs.map(([ru,en,accepted,why])=>[{ru,en},answer(...accepted),why]))
  ];
  if(dialogue){
    items.push({...base,id:'a1.dialogue.'+key,type:'dialogue',tags:['dialogue'],scene:dialogue.scene,
      lines:dialogue.lines.map(([partner,task,accepted,display],index)=>({
        id:'a1.dialogue.'+key+'.line-'+(index+1),partner:{ru:partner},task,answer:answer(...accepted),displayAnswer:display
      }))});
  }
  return items;
}

const day4=()=>day(4,{
  key:'price',
  plan:{ru:'Спроси вслух, сколько что-то стоит, и скажи, как платишь.\n\n• How much is it?\n• It is twenty.\n• Can I pay by card?',
    en:'Ask out loud how much it is. Then say how you pay.\n\n• How much is it?\n• It is twenty.\n• Can I pay by card?'},
  title:{ru:'Сколько стоит',en:'How much is it'},
  body:{ru:'<p><b>How much is it?</b> — сколько стоит?</p><p><b>It is</b> ten / twenty / fifty — это стоит десять / двадцать / пятьдесят.</p><p><b>Can I pay by card?</b> — можно картой? Наличными — <b>cash</b>.</p>',
    en:'<p><b>How much is it?</b></p><p><b>It is</b> ten / twenty / fifty.</p><p><b>Can I pay by card?</b> Or pay <b>cash</b>.</p>'},
  choices:[
    {prompt:{ru:'Как спросить «Сколько это стоит?»',en:'Choose the right question.'},options:['How much is it?','How many is it?','How much it is?'],
      explanation:{ru:'Про деньги спрашивают how much, и в вопросе is идёт перед it.',en:'Say how much for a price; is goes before it.'}},
    {prompt:{ru:'Как спросить «Можно картой?»',en:'Choose the right question.'},options:['Can I pay by card?','Can I pay card?','I can pay by card?'],
      explanation:{ru:'Can I…? — можно мне…? Картой — by card.',en:'Can I…? + pay by card.'}}
  ],
  translation:{prompt:{ru:'Это стоит двадцать.',en:'It is twenty.'},answers:['It is twenty','It\'s twenty','Twenty'],
    explanation:{ru:'It is + число. В разговоре коротко It\'s.',en:'It is + the price.'}},
  pattern:{ru:'How much is it? / Can I pay by…?',en:'How much is it? / Can I pay by…?'},
  pairs:[
    ['Сколько это стоит?','How much is it?',['How much is it'],{ru:'Готовый вопрос: how much — сколько, is it — это стоит.',en:'Say it as one phrase.'}],
    ['Это стоит десять.','It is ten.',['It is ten','It\'s ten'],{ru:'It is + число — так называют цену.',en:'It is + the price.'}],
    ['Можно картой?','Can I pay by card?',['Can I pay by card'],{ru:'Can I…? — вежливая просьба, by card — картой.',en:'Can I + pay by card.'}]
  ]
});

const day5=()=>day(5,{
  key:'work',
  plan:{ru:'Расскажи вслух, чем ты занимаешься, и спроси то же у собеседника.\n\n• What do you do?\n• I work in an office.\n• I am a doctor.',
    en:'Say out loud what you do. Then ask the same.\n\n• What do you do?\n• I work in an office.\n• I am a doctor.'},
  title:{ru:'Чем ты занимаешься',en:'What you do'},
  body:{ru:'<p><b>What do you do?</b> — чем ты занимаешься? Так спрашивают про работу.</p><p><b>I work in</b> an office / in IT — я работаю в офисе / в IT.</p><p><b>I am a</b> doctor — я врач. Перед профессией нужен <b>a</b>, а перед гласным звуком — <b>an</b>: an engineer.</p>',
    en:'<p><b>What do you do?</b> — a question about your work.</p><p><b>I work in</b> an office / in IT.</p><p><b>I am a</b> doctor. Say <b>a</b> before the job, but <b>an</b> engineer.</p>'},
  choices:[
    {prompt:{ru:'Как спросить, кем человек работает?',en:'Choose the question about work.'},options:['What do you do?','What are you do?','What you do?'],
      explanation:{ru:'В вопросе с обычным глаголом нужен do: What do you do?',en:'Say do in the question: What do you do?'}},
    {prompt:{ru:'Выбери: «Я инженер».',en:'Choose the right answer.'},options:['I am an engineer.','I am engineer.','I an engineer.'],
      explanation:{ru:'Перед профессией нужен артикль. Engineer начинается с гласного звука, поэтому an.',en:'Say an engineer, not a engineer.'}}
  ],
  translation:{prompt:{ru:'Я работаю в офисе.',en:'I work in an office.'},answers:['I work in an office','I work in office','I work at an office'],
    explanation:{ru:'I work — я работаю, am здесь не нужен. В офисе — in an office.',en:'I work, without am. In an office.'}},
  pattern:{ru:'I work in… / I am a…',en:'I work in… / I am a…'},
  pairs:[
    ['Чем ты занимаешься?','What do you do?',['What do you do'],{ru:'Первый do нужен для вопроса, второй значит «делаешь».',en:'The first do makes the question.'}],
    ['Я работаю в IT.','I work in IT.',['I work in IT'],{ru:'Work — действие, поэтому am не нужен.',en:'Say I work, without am.'}],
    ['Я врач.','I am a doctor.',['I am a doctor','I\'m a doctor'],{ru:'Перед профессией — a: I am a doctor.',en:'Say a before the job.'}]
  ]
});

const day6=()=>day(6,{
  key:'where',
  plan:{ru:'Спроси вслух, где супермаркет, и повтори ответ.\n\n• Where is the supermarket?\n• It is near here.\n• Turn left.',
    en:'Ask out loud where the supermarket is. Then say the answer again.\n\n• Where is the supermarket?\n• It is near here.\n• Turn left.'},
  title:{ru:'Где это',en:'Where is it'},
  body:{ru:'<p><b>Where is</b> the supermarket? — где супермаркет?</p><p><b>It is near here</b> — это рядом. <b>It is far</b> — это далеко.</p><p><b>Turn left</b> / <b>turn right</b> — поверни налево / направо.</p>',
    en:'<p><b>Where is</b> the supermarket?</p><p><b>It is near here.</b> / <b>It is far.</b></p><p><b>Turn left</b> / <b>turn right</b>.</p>'},
  choices:[
    {prompt:{ru:'Как спросить «Где супермаркет?»',en:'Choose the right question.'},options:['Where is the supermarket?','Where the supermarket is?','Where supermarket?'],
      explanation:{ru:'В вопросе is стоит сразу после where.',en:'In a question is goes right after where.'}},
    {prompt:{ru:'Выбери: «Поверни направо».',en:'Choose the right answer.'},options:['Turn right.','Turn left.','You right.'],
      explanation:{ru:'Right — направо, left — налево. Указание начинается с глагола turn.',en:'Right is not left. Start with turn.'}}
  ],
  translation:{prompt:{ru:'Это рядом.',en:'It is near here.'},answers:['It is near here','It\'s near here','It is near','It\'s near'],
    explanation:{ru:'Рядом — near here, дословно «близко отсюда».',en:'Near here: not far.'}},
  pattern:{ru:'Where is…? / Turn left / right',en:'Where is…? / Turn left / right'},
  pairs:[
    ['Где супермаркет?','Where is the supermarket?',['Where is the supermarket'],{ru:'Where is + что ищешь. Перед названием места — the.',en:'Where is + the place.'}],
    ['Поверни налево.','Turn left.',['Turn left'],{ru:'Указание начинается прямо с глагола: Turn left.',en:'Start with the action: Turn left.'}],
    ['Это далеко?','Is it far?',['Is it far'],{ru:'В вопросе is встаёт первым: Is it far?',en:'In a question is goes first.'}]
  ],
  dialogue:{scene:{ru:'Где супермаркет',en:'Where is the supermarket'},lines:[
    ['Hi! Can I help you?',{ru:'Спроси, где супермаркет',en:'Ask where the supermarket is'},
      ['Where is the supermarket','Where is the supermarket please','Where is the supermarket, please'],'Where is the supermarket?'],
    ['Turn left. It is near here.',{ru:'Поблагодари',en:'Say thank you'},['Thank you','Thanks'],'Thank you.']
  ]}
});

const day7=()=>day(7,{
  key:'time',
  plan:{ru:'Спроси вслух, который час, и договорись о времени.\n\n• What time is it?\n• It is five o\'clock.\n• See you tomorrow.',
    en:'Ask out loud what time it is. Then agree on a time.\n\n• What time is it?\n• It is five o\'clock.\n• See you tomorrow.'},
  title:{ru:'Время',en:'Time'},
  body:{ru:'<p><b>What time is it?</b> — который час?</p><p><b>It is five o\'clock</b> — пять часов. Время встречи — <b>at</b>: at ten.</p><p><b>See you tomorrow</b> — до завтра. <b>In the morning</b> — утром, <b>in the evening</b> — вечером.</p>',
    en:'<p><b>What time is it?</b></p><p><b>It is five o\'clock.</b> A time to meet: <b>at</b> ten.</p><p><b>See you tomorrow.</b> <b>In the morning</b>, <b>in the evening</b>.</p>'},
  choices:[
    {prompt:{ru:'Как спросить «Который час?»',en:'Choose the right question.'},options:['What time is it?','What time it is?','How time is it?'],
      explanation:{ru:'Про время спрашивают what time, а is идёт перед it.',en:'What time + is it.'}},
    {prompt:{ru:'Выбери: «в десять».',en:'Choose the right answer.'},options:['at ten','in ten','on ten'],
      explanation:{ru:'Со временем на часах говорят at: at ten, at five.',en:'Say at with a time.'}}
  ],
  translation:{prompt:{ru:'До завтра.',en:'See you tomorrow.'},answers:['See you tomorrow'],
    explanation:{ru:'Дословно «увидимся завтра» — так прощаются до завтра.',en:'Say it when you meet again tomorrow.'}},
  pattern:{ru:'What time…? / at…',en:'What time…? / at…'},
  pairs:[
    ['Который час?','What time is it?',['What time is it'],{ru:'Готовый вопрос: what time — какое время, is it — сейчас.',en:'Say it as one phrase.'}],
    ['Сейчас пять часов.','It is five o\'clock.',['It is five o\'clock','It\'s five o\'clock','It is five','It\'s five'],{ru:'It is + число + o\'clock. O\'clock можно не говорить.',en:'It is + five, ten… + o\'clock.'}],
    ['Увидимся в десять.','See you at ten.',['See you at ten'],{ru:'Со временем — at: at ten.',en:'Say at with a time.'}]
  ]
});

const day8=()=>day(8,{
  key:'like',
  plan:{ru:'Скажи вслух, что тебе нравится, а что нет.\n\n• I like coffee.\n• I don\'t like milk.\n• Do you like coffee?',
    en:'Say out loud what you like and what you don\'t.\n\n• I like coffee.\n• I don\'t like milk.\n• Do you like coffee?'},
  title:{ru:'Нравится и не нравится',en:'Like and don\'t like'},
  body:{ru:'<p><b>I like</b> coffee — я люблю кофе, мне нравится кофе.</p><p><b>I don\'t like</b> milk — я не люблю молоко. Don\'t = do not.</p><p><b>Do you like</b> coffee? — ты любишь кофе? Ответ: <b>Yes, I do</b> / <b>No, I don\'t</b>.</p>',
    en:'<p><b>I like</b> coffee.</p><p><b>I don\'t like</b> milk. Don\'t = do not.</p><p><b>Do you like</b> coffee? — <b>Yes, I do</b> / <b>No, I don\'t</b>.</p>'},
  choices:[
    {prompt:{ru:'Выбери: «Я не люблю молоко».',en:'Choose the right answer.'},options:['I don\'t like milk.','I not like milk.','I am not like milk.'],
      explanation:{ru:'Отрицание с обычным глаголом — через don\'t: I don\'t like.',en:'Say don\'t before like.'}},
    {prompt:{ru:'Как ответить «Да» на «Do you like coffee?»',en:'Choose the short answer to «Do you like coffee?»'},options:['Yes, I do.','Yes, I like.','Yes, I am.'],
      explanation:{ru:'Спросили с do — отвечают тоже с do: Yes, I do.',en:'The question has do, so the answer has do.'}}
  ],
  translation:{prompt:{ru:'Я люблю кофе.',en:'I like coffee.'},answers:['I like coffee'],
    explanation:{ru:'«Люблю» про еду и занятия — like. Love — это сильнее.',en:'Say like for food and for what you do.'}},
  pattern:{ru:'I like… / I don\'t like… / Do you like…?',en:'I like… / I don\'t like… / Do you like…?'},
  pairs:[
    ['Я люблю кофе.','I like coffee.',['I like coffee'],{ru:'I like + что нравится.',en:'I like + the thing.'}],
    ['Я не люблю молоко.','I don\'t like milk.',['I don\'t like milk','I do not like milk'],{ru:'Don\'t перед глаголом делает «не».',en:'Don\'t before like.'}],
    ['Ты любишь кофе?','Do you like coffee?',['Do you like coffee'],{ru:'Вопрос начинается с do.',en:'Start the question with do.'}]
  ]
});

const day9=()=>day(9,{
  key:'understand',
  plan:{ru:'Скажи вслух, что не понимаешь, и попроси повторить медленнее.\n\n• Sorry, I don\'t understand.\n• Can you say it again, please?\n• I speak a little English.',
    en:'Say out loud that you don\'t understand. Ask to say it again.\n\n• Sorry, I don\'t understand.\n• Can you say it again, please?\n• I speak a little English.'},
  title:{ru:'Если непонятно',en:'When you don\'t understand'},
  body:{ru:'<p><b>Sorry, I don\'t understand.</b> — извини, я не понимаю.</p><p><b>Can you say it again, please?</b> — можешь повторить? <b>Slowly, please</b> — помедленнее, пожалуйста.</p><p><b>I speak a little English</b> — я немного говорю по-английски.</p>',
    en:'<p><b>Sorry, I don\'t understand.</b></p><p><b>Can you say it again, please?</b> <b>Slowly, please.</b></p><p><b>I speak a little English.</b></p>'},
  choices:[
    {prompt:{ru:'Как попросить повторить?',en:'Choose the polite way to ask again.'},options:['Can you say it again, please?','Say again you.','You can again?'],
      explanation:{ru:'Can you…, please? — вежливая просьба к собеседнику.',en:'Can you…, please? is polite.'}},
    {prompt:{ru:'Выбери: «Я немного говорю по-английски».',en:'Choose the right answer.'},options:['I speak a little English.','I speak little a English.','I am speak a little English.'],
      explanation:{ru:'A little — немного, стоит перед English. Am не нужен: speak — действие.',en:'A little + English, without am.'}}
  ],
  translation:{prompt:{ru:'Помедленнее, пожалуйста.',en:'Slowly, please.'},answers:['Slowly, please','Slowly please'],
    explanation:{ru:'Коротко: slowly + please.',en:'Short: slowly + please.'}},
  pattern:{ru:'I don\'t understand / Can you…?',en:'I don\'t understand / Can you…?'},
  pairs:[
    ['Извини, я не понимаю.','Sorry, I don\'t understand.',['Sorry, I don\'t understand','Sorry I don\'t understand','I don\'t understand'],{ru:'Don\'t understand — не понимаю, sorry смягчает.',en:'Sorry is polite.'}],
    ['Можешь повторить, пожалуйста?','Can you say it again, please?',['Can you say it again, please','Can you say it again please','Can you say it again'],{ru:'Дословно «можешь сказать это снова».',en:'Can you + say it again.'}],
    ['Я немного говорю по-английски.','I speak a little English.',['I speak a little English'],{ru:'A little — немного. Язык пишется с большой буквы: English.',en:'A little + English.'}]
  ]
});

const day10=()=>day(10,{
  key:'taxi',
  plan:{ru:'Скажи вслух таксисту, куда ехать, и где остановиться.\n\n• To the airport, please.\n• Stop here, please.\n• How much is it?',
    en:'Tell the taxi out loud where to go and where to stop.\n\n• To the airport, please.\n• Stop here, please.\n• How much is it?'},
  title:{ru:'Такси',en:'Taxi'},
  body:{ru:'<p><b>To the airport, please.</b> — в аэропорт, пожалуйста. Куда — через <b>to</b>.</p><p><b>Stop here, please.</b> — остановите здесь.</p><p><b>How much is it?</b> — сколько с меня?</p>',
    en:'<p><b>To the airport, please.</b> Say <b>to</b> + the place.</p><p><b>Stop here, please.</b></p><p><b>How much is it?</b></p>'},
  choices:[
    {prompt:{ru:'Как сказать «В аэропорт, пожалуйста»?',en:'Choose the right answer.'},options:['To the airport, please.','In the airport, please.','At airport, please.'],
      explanation:{ru:'Куда едешь — to: to the airport.',en:'Say to + the place you go.'}},
    {prompt:{ru:'Как попросить остановить здесь?',en:'Choose the right answer.'},options:['Stop here, please.','Here stop, please.','Stop is here.'],
      explanation:{ru:'Просьба начинается с глагола: Stop here.',en:'Start with the action: Stop here.'}}
  ],
  translation:{prompt:{ru:'Остановите здесь, пожалуйста.',en:'Stop here, please.'},answers:['Stop here, please','Stop here please','Please stop here'],
    explanation:{ru:'Stop + here + please. Please можно поставить и в начало.',en:'Stop here + please.'}},
  pattern:{ru:'To the…, please / Stop here',en:'To the…, please / Stop here'},
  pairs:[
    ['В аэропорт, пожалуйста.','To the airport, please.',['To the airport, please','To the airport please'],{ru:'Куда — to, перед местом — the.',en:'To + the place.'}],
    ['Остановите здесь, пожалуйста.','Stop here, please.',['Stop here, please','Stop here please'],{ru:'Stop here — остановите здесь.',en:'Start with stop.'}],
    ['Можно картой?','Can I pay by card?',['Can I pay by card'],{ru:'Фраза из дня 4: Can I pay by card?',en:'The phrase from Day 4.'}]
  ],
  dialogue:{scene:{ru:'В такси',en:'In a taxi'},lines:[
    ['Hi! Where to?',{ru:'Скажи, что тебе в аэропорт',en:'Say you go to the airport'},['To the airport, please','To the airport please','To the airport'],'To the airport, please.'],
    ['OK. Here you are.',{ru:'Спроси, сколько стоит',en:'Ask how much it is'},['How much is it'],'How much is it?'],
    ['It is fifty.',{ru:'Спроси, можно ли картой',en:'Ask to pay by card'},['Can I pay by card','Can I pay by card, please','Can I pay by card please'],'Can I pay by card?']
  ]}
});

const day11=()=>day(11,{
  key:'shop',
  plan:{ru:'Спроси вслух в магазине, есть ли то, что нужно.\n\n• Do you have milk?\n• I need water.\n• It is expensive.',
    en:'Ask out loud in a shop if they have what you need.\n\n• Do you have milk?\n• I need water.\n• It is expensive.'},
  title:{ru:'В магазине',en:'In a shop'},
  body:{ru:'<p><b>Do you have</b> milk? — у вас есть молоко?</p><p><b>I need</b> water — мне нужна вода.</p><p><b>It is expensive</b> — это дорого. <b>It is cheap</b> — это дёшево.</p>',
    en:'<p><b>Do you have</b> milk?</p><p><b>I need</b> water.</p><p><b>It is expensive.</b> / <b>It is cheap.</b></p>'},
  choices:[
    {prompt:{ru:'Как спросить «У вас есть молоко?»',en:'Choose the right question.'},options:['Do you have milk?','Are you have milk?','You have milk is?'],
      explanation:{ru:'Have — обычный глагол, поэтому вопрос строится с do.',en:'Have is an action word, so ask with do.'}},
    {prompt:{ru:'Выбери: «Это дорого».',en:'Choose the right answer.'},options:['It is expensive.','It expensive.','Is it expensive.'],
      explanation:{ru:'В утверждении нужен is, и он стоит после it.',en:'Say it is, not just it.'}}
  ],
  translation:{prompt:{ru:'Мне нужна вода.',en:'I need water.'},answers:['I need water','I need some water','I need a water'],
    explanation:{ru:'«Мне нужно» по-английски — I need, дословно «я нуждаюсь».',en:'I need + the thing.'}},
  pattern:{ru:'Do you have…? / I need…',en:'Do you have…? / I need…'},
  pairs:[
    ['У вас есть молоко?','Do you have milk?',['Do you have milk','Do you have any milk'],{ru:'Вопрос начинается с do, затем you have.',en:'Do + you have.'}],
    ['Мне нужна вода.','I need water.',['I need water','I need some water'],{ru:'I need — мне нужно. Am не нужен.',en:'I need, without am.'}],
    ['Это дёшево.','It is cheap.',['It is cheap','It\'s cheap'],{ru:'It is + какое: cheap — дёшево, expensive — дорого.',en:'It is + cheap or expensive.'}]
  ]
});

const day12=()=>day(12,{
  key:'smalltalk',
  plan:{ru:'Проведи вслух короткий разговор с новым соседом: всё, что ты уже умеешь.\n\n• Hi, I am Anna.\n• I am from Russia.\n• I work in IT.',
    en:'Have a short talk with a new friend out loud. Say all you can now.\n\n• Hi, I am Anna.\n• I am from Russia.\n• I work in IT.'},
  title:{ru:'Короткий разговор',en:'A short talk'},
  body:{ru:'<p>Ты уже умеешь представиться, сказать, откуда ты, чем занимаешься и что любишь.</p><p>Если собеседник спросил тебя, спроси в ответ: <b>And you?</b> — а ты?</p><p>Если что-то непонятно — <b>Sorry, can you say it again?</b></p>',
    en:'<p>You can say your name, where you are from, what you do and what you like.</p><p>Ask back: <b>And you?</b></p><p>If you don\'t understand: <b>Sorry, can you say it again?</b></p>'},
  choices:[
    {prompt:{ru:'Как коротко спросить в ответ «А ты?»',en:'Choose the short way to ask back.'},options:['And you?','And your?','You and?'],
      explanation:{ru:'And you? — самый короткий способ вернуть вопрос.',en:'And you? is the same question back.'}},
    {prompt:{ru:'Тебя спросили «What do you do?». Что ответить?',en:'Choose the answer to «What do you do?»'},options:['I work in IT.','I am from Russia.','I like coffee.'],
      explanation:{ru:'What do you do? — вопрос про работу.',en:'What do you do? is about your work.'}}
  ],
  translation:{prompt:{ru:'Я живу в Дубае, а ты?',en:'I live in Dubai. And you?'},answers:['I live in Dubai, and you','I live in Dubai and you','I live in Dubai. And you'],
    explanation:{ru:'Фраза из дня 2 и новый вопрос в ответ: and you.',en:'The phrase from Day 2 + and you.'}},
  pattern:{ru:'Всё вместе',en:'All together'},
  pairs:[
    ['Привет, я Анна.','Hi, I am Anna.',['Hi, I am Anna','Hi I am Anna','Hi, I\'m Anna','Hi I\'m Anna'],{ru:'Hi + I am + имя.',en:'Hi + I am + your name.'}],
    ['Я из России, а ты?','I am from Russia. And you?',['I am from Russia, and you','I am from Russia and you','I am from Russia. And you','I\'m from Russia, and you','I\'m from Russia and you'],{ru:'I am from + страна, and you — вопрос в ответ.',en:'I am from + and you.'}],
    ['Я работаю в IT.','I work in IT.',['I work in IT'],{ru:'Фраза из дня 5.',en:'The phrase from Day 5.'}]
  ],
  dialogue:{scene:{ru:'Новый сосед',en:'A new friend'},lines:[
    ['Hi! I live here, next to you.',{ru:'Представься',en:'Say your name'},['Hi, I am Anna','Hi I am Anna','Hi, I\'m Anna','I am Anna','My name is Anna','Hi, my name is Anna'],'Hi, I am Anna.'],
    ['Nice to meet you. Where are you from?',{ru:'Скажи, откуда ты, и спроси в ответ',en:'Say where you are from and ask back'},
      ['I am from Russia. And you','I am from Russia, and you','I am from Russia and you','I\'m from Russia. And you','I\'m from Russia, and you','I\'m from Russia and you'],'I am from Russia. And you?'],
    ['I am from here. What do you do?',{ru:'Скажи, чем занимаешься',en:'Say what you do'},['I work in IT','I work in an office','I am a doctor','I\'m a doctor'],'I work in IT.']
  ]}
});

export function buildA1StarterCourse(){
  const days=[day1(),day2(),day3(),day4(),day5(),day6(),day7(),day8(),day9(),day10(),day11(),day12()];
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
    description:{ru:'12 коротких дней с нуля: знакомство, цены, дорога, время, магазин и такси.',en:'12 short days from zero: hello, prices, directions, time, shops and taxis.'},
    level:{from:'a1',to:'a1',labels:['A1']},
    access:{mode:'entitlement',entitlement:A1_STARTER_SKU,
      freePreview:{kind:'first-days',days:1,learnedContentStaysAvailable:true}},
    defaultRoadmapId:'main',
    roadmaps:[{id:'main',title:{ru:'Путь',en:'Path'},nodes}],
    activities,
    resources:[]
  };
}
