const {parseTalkResponse,buildTalkPrompt,allowTalkTrial,TRIAL_TURNS}=require('../lib/unmute-ai-actions');

let bad=0;
const ok=(name,value)=>{if(!value)bad++;console.log((value?'  ok  ':' FAIL ')+name);};

const good=parseTalkResponse('{"reply":"Sounds good.","correction":"I went there yesterday.","note":"Use past simple."}');
ok('talk protocol accepts strict JSON',good.ok&&JSON.parse(good.text).reply==='Sounds good.');
ok('talk prompt contains server-owned contract',buildTalkPrompt({
  topic:'At a clinic',
  promptTemplate:'Act as a receptionist',
  focus:['appointments'],
  history:[{role:'assistant',text:'Hello'}],
  message:'I need doctor',
  locale:'ru'
}).includes('UNMUTE_TALK_V1'));
ok('talk protocol rejects arbitrary prose',!parseTalkResponse('hello there').ok);

(async()=>{
  const memory=new Map();
  const counts=new Map();
  const fakeStore={
    get:async key=>memory.get(key)||null,
    set:async(key,value)=>{memory.set(key,String(value));},
    incr:async key=>{
      const next=(counts.get(key)||0)+1;
      counts.set(key,next);
      return next;
    }
  };
  const base={accountHash:'abc123',body:{conversationId:'conversation_123'},store:fakeStore};
  let allowed=true;
  for(let i=0;i<TRIAL_TURNS;i++) allowed=allowed&&await allowTalkTrial(base);
  ok('one free conversation allows the configured number of turns',allowed);
  ok('free conversation stops after the turn cap',!(await allowTalkTrial(base)));
  ok('a second free conversation id is rejected',!(await allowTalkTrial({
    accountHash:'abc123',
    body:{conversationId:'conversation_456'},
    store:fakeStore
  })));

  process.exit(bad?1:0);
})().catch(error=>{console.error(error);process.exit(1);});
