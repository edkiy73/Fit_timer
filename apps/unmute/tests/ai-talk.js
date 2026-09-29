'use strict';

const assert=require('assert');
const {registry,buildTalkPrompt,parseReply,cleanHistory,buildTalkReviewPrompt,parseTalkReview}=require('../lib/unmute-ai-actions');

async function main(){
  assert.equal(typeof require('../api/admin'),'function');
  assert.deepEqual(cleanHistory([
    {role:'learner',text:'  hello  '},
    {role:'partner',text:'Hi!'},
    {role:'weird',text:'again'}
  ]),[
    {role:'learner',text:'hello'},
    {role:'partner',text:'Hi!'},
    {role:'learner',text:'again'}
  ]);

  const prompt=buildTalkPrompt({
    locale:'ru',
    topic:'At the pharmacy',
    promptTemplate:'You are a pharmacist.',
    focus:['Could I…?','I need…'],
    history:[{role:'partner',text:'How can I help you?'}],
    learnerText:'I need medicine for headache'
  });
  assert.match(prompt,/At the pharmacy/);
  assert.match(prompt,/I need medicine for headache/);
  assert.match(prompt,/Return ONLY strict JSON/);

  const openerPrompt=buildTalkPrompt({
    locale:'en',
    topic:'At the bank',
    promptTemplate:'Act as a bank clerk.',
    focus:[],
    history:[],
    learnerText:'',
    start:true
  });
  assert.match(openerPrompt,/START THE CONVERSATION/);
  assert.doesNotMatch(openerPrompt,/LATEST LEARNER MESSAGE/);

  assert.deepEqual(parseReply('{"reply":"Do you have a fever?","correction":null,"note":null}'),{
    ok:true,
    text:'{"reply":"Do you have a fever?","correction":null,"note":null}'
  });
  assert.equal(parseReply('not json').ok,false);
  assert.equal(parseReply('{"reply":""}').reason,'talk_missing_reply');

  const reviewPrompt=buildTalkReviewPrompt({
    locale:'ru',
    topic:'At the pharmacy',
    promptTemplate:'You are a pharmacist.',
    focus:['I need…'],
    history:[
      {role:'partner',text:'How can I help you?'},
      {role:'learner',text:'I need medicine for headache'}
    ]
  });
  assert.match(reviewPrompt,/completed English practice conversation/);
  assert.match(reviewPrompt,/I need medicine for headache/);
  assert.match(reviewPrompt,/strengths/);

  assert.deepEqual(parseTalkReview(JSON.stringify({
    strengths:['Ты сразу объяснил проблему.'],
    corrections:[{
      original:'I need medicine for headache',
      better:'I need some medicine for a headache.',
      why:'Нужны артикль и some.'
    }],
    focus:'Потренируй артикли в просьбах.'
  })),{
    ok:true,
    text:JSON.stringify({
      strengths:['Ты сразу объяснил проблему.'],
      corrections:[{
        original:'I need medicine for headache',
        better:'I need some medicine for a headache.',
        why:'Нужны артикль и some.'
      }],
      focus:'Потренируй артикли в просьбах.'
    })
  });
  assert.equal(parseTalkReview('not json').ok,false);

  const action=registry.get('talk.reply');
  assert(action);
  let generatedPrompt='';
  const result=await action.run({
    settings:{},
    body:{
      locale:'ru',
      topic:'At the pharmacy',
      promptTemplate:'Keep it practical.',
      focus:['I need…'],
      history:[],
      learnerText:'I need medicine'
    },
    async generate(type,settings,modelPrompt,options){
      assert.equal(type,'text');
      generatedPrompt=modelPrompt;
      const out={text:'{"reply":"What kind of medicine do you need?","correction":null,"note":null}'};
      const verdict=options.validate(out);
      assert.equal(verdict.ok,true);
      return {text:verdict.text,provider:'test',model:'test',fallback:false};
    }
  });
  assert.match(generatedPrompt,/speaking partner/);
  assert.equal(JSON.parse(result.text).reply,'What kind of medicine do you need?');

  const reviewAction=registry.get('talk.review');
  assert(reviewAction);
  const reviewResult=await reviewAction.run({
    settings:{},
    body:{
      locale:'ru',
      topic:'At the pharmacy',
      promptTemplate:'Keep it practical.',
      focus:['I need…'],
      history:[
        {role:'partner',text:'How can I help?'},
        {role:'learner',text:'I need medicine'}
      ]
    },
    async generate(type,settings,modelPrompt,options){
      assert.equal(type,'text');
      assert.match(modelPrompt,/FOCUS/);
      const out={text:JSON.stringify({
        strengths:['Ты быстро сформулировал просьбу.'],
        corrections:[],
        focus:'Добавляй артикли там, где они нужны.'
      })};
      const verdict=options.validate(out);
      assert.equal(verdict.ok,true);
      return {text:verdict.text,provider:'test',model:'test',fallback:false};
    }
  });
  assert.equal(JSON.parse(reviewResult.text).focus,'Добавляй артикли там, где они нужны.');

  console.log('UnMute AI talk action tests passed');
}

main().catch(error=>{console.error(error);process.exit(1);});
