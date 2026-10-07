/* The AI day without Plus: a ready task to paste into the learner's own AI (ChatGPT, Gemini…).
   The AI leads the talk on the day's topic and ends with a verdict; the learner then marks
   the step done themselves (owner decision: honour-based, never blocks the course). */

export interface OwnAITalkInput {
  topic:string;
  scenario:string;
  focus:string[];
  locale:'ru'|'en';
}

function clean(value:string,max:number):string{
  return String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
}

export function ownAITalkPrompt(input:OwnAITalkInput):string{
  const topic=clean(input.topic,300);
  const scenario=clean(input.scenario,2400);
  const focus=(input.focus||[]).map(item=>clean(item,120)).filter(Boolean).slice(0,12);
  const showScenario=scenario&&scenario.toLowerCase()!==topic.toLowerCase();
  if(input.locale==='en'){
    return [
      'Be my speaking partner for English practice. I am learning English for everyday life abroad (level A1–A2).',
      'Topic: '+topic+'.',
      showScenario?'Scenario: '+scenario:'',
      focus.length?'Phrases I am practising: '+focus.join('; ')+'.':'',
      'How to run the conversation:',
      '- Speak only English, short and simple: one or two sentences at a time.',
      '- Start first: greet me and ask the first question on the topic.',
      '- Ask one question at a time and wait for my answer.',
      '- If I make a mistake, briefly show how to say it correctly and carry on.',
      '- Do 8–10 exchanges and give me chances to use the phrases above.',
      'At the end, give me a verdict:',
      '- "Lesson passed" if I mostly understand the questions and answer on topic with clear phrases;',
      '- or "Practise again" and what exactly to work on.',
      'Then list 2–3 of my mistakes with the correct version.'
    ].filter(Boolean).join('\n');
  }
  return [
    'Будь моим собеседником для разговорной практики английского. Я учу английский для жизни за границей (уровень A1–A2).',
    'Тема: '+topic+'.',
    showScenario?'Сценарий: '+scenario:'',
    focus.length?'Фразы, которые я тренирую: '+focus.join('; ')+'.':'',
    'Как вести разговор:',
    '- Говори только по-английски, коротко и просто: одна-две фразы за раз.',
    '- Начни первым: поздоровайся и задай первый вопрос по теме.',
    '- Задавай по одному вопросу и жди моего ответа.',
    '- Если в моей фразе ошибка, коротко покажи, как сказать правильно, и продолжай.',
    '- Сделай 8–10 обменов репликами и давай мне шанс использовать фразы выше.',
    'В конце оцени меня по-русски:',
    '- «Урок пройден», если я в целом понимаю вопросы и отвечаю по теме понятными фразами;',
    '- или «Нужно повторить» — и что именно потренировать.',
    'Затем перечисли 2–3 мои ошибки с правильным вариантом.'
  ].filter(Boolean).join('\n');
}
