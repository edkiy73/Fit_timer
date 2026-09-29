'use strict';

const assert=require('assert');
const {registry,buildTalkPrompt,parseReply,cleanHistory}=require('../lib/unmute-ai-actions');

async function main(){
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

  assert.deepEqual(parseReply('{"reply":"Do you have a fever?","correction":null,"note":null}'),{
    ok:true,
    text:'{"reply":"Do you have a fever?","correction":null,"note":null}'
  });
  assert.equal(parseReply('not json').ok,false);
  assert.equal(parseReply('{"reply":""}').reason,'talk_missing_reply');

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

  console.log('UnMute AI talk action tests passed');
}

main().catch(error=>{console.error(error);process.exit(1);});
