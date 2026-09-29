'use strict';

const {createAIActionRegistry}=require('../../../packages/core/server/ai-action-registry');

const line=(value,max)=>String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const cleanLocale=value=>String(value||'').toLowerCase().startsWith('en')?'en':'ru';

function cleanHistory(value){
  if(!Array.isArray(value))return [];
  return value.slice(-12).map(item=>{
    const role=item&&item.role==='partner'?'partner':'learner';
    const text=line(item&&item.text,600);
    return text?{role,text}:null;
  }).filter(Boolean);
}

function parseReply(text){
  let parsed;
  try{parsed=JSON.parse(String(text||''));}
  catch(_){return {ok:false,reason:'talk_invalid_json',missing:['reply']};}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)){
    return {ok:false,reason:'talk_invalid_object',missing:['reply']};
  }
  const reply=line(parsed.reply,600);
  if(!reply)return {ok:false,reason:'talk_missing_reply',missing:['reply']};
  const correction=line(parsed.correction,600);
  const note=line(parsed.note,600);
  return {
    ok:true,
    text:JSON.stringify({
      reply,
      correction:correction||null,
      note:note||null
    })
  };
}

function buildTalkPrompt(body){
  const locale=cleanLocale(body&&body.locale);
  const topic=line(body&&body.topic,300);
  const promptTemplate=line(body&&body.promptTemplate,2400);
  const focus=Array.isArray(body&&body.focus)
    ? body.focus.map(item=>line(item,120)).filter(Boolean).slice(0,12)
    : [];
  const learnerText=line(body&&body.learnerText,600);
  const start=body&&body.start===true;
  const history=cleanHistory(body&&body.history);
  if(!topic||(!start&&!learnerText))throw Object.assign(new Error('talk_bad_input'),{status:400,code:'talk_bad_input'});

  const transcript=history.map(item=>
    (item.role==='partner'?'PARTNER':'LEARNER')+': '+item.text
  ).join('\n');

  return [
    'You are the speaking partner inside UnMute, an English-for-real-life learning app.',
    'Continue the conversation naturally in English. Do not become a teacher unless feedback is requested below.',
    'Keep REPLY short: normally one sentence, never more than two short sentences.',
    'Ask at most one question. Stay inside the stated scenario and do not invent unrelated tasks.',
    focus.length?'Try to naturally create chances to use these target patterns: '+focus.join(' | '):'',
    promptTemplate?'SCENARIO INSTRUCTIONS: '+promptTemplate:'',
    'TOPIC: '+topic,
    transcript?'RECENT TRANSCRIPT:\n'+transcript:'',
    start
      ? 'START THE CONVERSATION: speak first as the partner with one natural opening line or question. Set correction and note to null.'
      : 'LATEST LEARNER MESSAGE: '+learnerText,
    'Return ONLY strict JSON with this exact shape:',
    '{"reply":"English partner reply","correction":null,"note":null}',
    'If the learner made a clear English mistake that matters for meaning or natural speech, set correction to a concise corrected version of ONLY their latest message.',
    locale==='ru'
      ? 'If correction is non-null, note may contain one very short explanation in Russian. Otherwise note must be null.'
      : 'If correction is non-null, note may contain one very short explanation in English. Otherwise note must be null.',
    'Do not use Markdown. Do not add keys.'
  ].filter(Boolean).join('\n\n');
}

const registry=createAIActionRegistry([
  {
    id:'talk.reply',
    type:'text',
    bucket:'light',
    async run({settings,body,generate}){
      const prompt=buildTalkPrompt(body||{});
      return generate('text',settings,prompt,{validate:out=>parseReply(out&&out.text)});
    },
    publicError(error){
      if(error&&String(error.code||error.message||'')==='talk_bad_input'){
        return {status:400,code:'talk_bad_input'};
      }
      return null;
    }
  }
],{
  malformedPattern:/talk_invalid_json|talk_invalid_object|talk_missing_reply/
});

module.exports={registry,buildTalkPrompt,parseReply,cleanHistory};
