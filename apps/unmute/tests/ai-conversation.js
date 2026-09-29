const {parseTalkResponse,buildTalkPrompt}=require('../lib/unmute-ai-actions');

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

process.exit(bad?1:0);
