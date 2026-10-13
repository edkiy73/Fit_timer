// Isolated prelaunch visual data. These identities are never sent to a domain API.
export const people = [
 {id:'maya',name:'Maya',age:29,city:'Bali',photo:5,ru:'Люблю разговоры, после которых чуть лучше понимаешь себя. Море, музыка и любопытство к миру.',en:'I love conversations that help us understand ourselves. The ocean, music and curiosity.',tags:['Trust','Travel','Connection']},
 {id:'alex',name:'Alex',age:32,city:'Berlin',photo:3,ru:'Сначала хороший разговор. Ценю открытость, чувство юмора и личное пространство.',en:'A good conversation comes first. I value openness, humour and personal space.',tags:['Culture','Openness','Music']},
 {id:'nika',name:'Nika',age:27,city:'Amsterdam',photo:1,ru:'Узнаю людей через их истории. Часто танцую, иногда рисую и всегда задаю вопросы.',en:'I get to know people through their stories. Often dancing, sometimes drawing, always asking questions.',tags:['Art','Friendship','Curiosity']},
] as const;
export const posts = [
 {author:0,ru:'Близость начинается не с одинаковых интересов, а с возможности спокойно сказать: «мне это не подходит». Как вы учились говорить о своих границах?',en:'Connection starts with being able to calmly say “this isn’t for me”. How did you learn to talk about your boundaries?',tag:'Trust',likes:24,replies:8},
 {author:1,ru:'Вчера на встрече клуба обсуждали, что помогает чувствовать себя услышанным. Мой ответ — когда человек не пытается сразу всё исправить. А ваш?',en:'At our club yesterday we talked about feeling heard. For me, it is when someone does not try to fix everything straight away. What about you?',tag:'Connection',likes:18,replies:5},
 {author:2,ru:'Собираемся в воскресенье на неспешный разговор у океана. Без ожиданий и обязательств — просто познакомиться и послушать разные истории.',en:'Meeting by the ocean on Sunday for a relaxed conversation. No expectations — just getting to know each other and hearing different stories.',tag:'Community',likes:31,replies:12},
] as const;
export const events = [
 {id:'ocean',ru:'Разговоры у океана',en:'Conversations by the ocean',city:'Bali · Berawa',format:'offline',day:'24',month:'OCT',time:'17:30',zone:'Asia/Makassar',language:'RU / EN',ruDescription:'Камерная встреча для знакомства и разговоров о доверии. Спокойный темп и уважение к границам.',enDescription:'A small gathering for conversations about trust. A relaxed pace and respect for boundaries.'},
 {id:'communication',ru:'Как говорить о желаниях',en:'Talking about what matters',city:'Online',format:'online',day:'25',month:'OCT',time:'19:00',zone:'Europe/Berlin',language:'EN',ruDescription:'Практический разговор о том, как слушать и быть услышанным. Вопросы, упражнения и обсуждение.',enDescription:'A practical conversation about listening and being heard. Questions, exercises and discussion.'},
 {id:'studio',ru:'Вечер открытых историй',en:'An evening of open stories',city:'Berlin · Mitte',format:'offline',day:'31',month:'OCT',time:'18:00',zone:'Europe/Berlin',language:'DE / EN',ruDescription:'Вечер личных историй и знакомства с сообществом. Можно делиться, можно просто слушать.',enDescription:'An evening of personal stories and meeting the community. Share a story or simply listen.'},
] as const;
export const groups = [
 {ru:'Искусство быть собой',en:'The art of being yourself',ruDescription:'Доверие, границы и честные разговоры.',enDescription:'Trust, boundaries and honest conversations.',members:284,color:'violet'},
 {ru:'Bali connections',en:'Bali connections',ruDescription:'Встречи и единомышленники на острове.',enDescription:'Gatherings and like-minded people on the island.',members:167,color:'rose'},
 {ru:'Открытый диалог',en:'Open conversations',ruDescription:'Разные взгляды. Уважительное общение.',enDescription:'Different perspectives. Respectful conversation.',members:392,color:'mint'},
] as const;
