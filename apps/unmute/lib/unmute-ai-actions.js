'use strict';

const {createAIActionRegistry}=require('../../../packages/core/server/ai-action-registry');
const {registerTestResponder}=require('../../../packages/core/server/ai');

const TRIAL_TURNS=8;
const TRIAL_KEY_PREFIX='unmute:ai:trial:talk:';

function clean(value,max){
  return String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
}

function parseTalkResponse(text){
  let raw=String(text||'').trim();
  raw=raw.replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'').trim();
  let data;
  try{ data=JSON.parse(raw); }catch(_){ return {ok:false,reason:'talk_json'}; }
  const reply=clean(data&&data.reply,1200);
  if(!reply)return {ok:false,reason:'talk_reply'};
  const normalized={reply};
  const correction=clean(data&&data.correction,600);
  const note=clean(data&&data.note,600);
  if(correction)normalized.correction=correction;
  if(note)normalized.note=note;
  return {ok:true,text:JSON.stringify(normalized)};
}

async function allowTalkTrial({accountHash,body,store}){
  const conversationId=clean(body&&body.conversationId,80);
  if(!/^[a-zA-Z0-9_-]{8,80}$/.test(conversationId))return false;
  const ownerKey=TRIAL_KEY_PREFIX+accountHash;
  let owner=await store.get(ownerKey);
  if(!owner){
    await store.set(ownerKey,conversationId);
    owner=conversationId;
  }
  if(owner!==conversationId)return false;
  const used=await store.incr(ownerKey+':'+conversationId+':turns',3650*86400);
  return used<=TRIAL_TURNS;
}

function buildTalkPrompt(body){
  const topic=clean(body&&body.topic,500);
  const template=clean(body&&body.promptTemplate,3000);
  const focus=Array.isArray(body&&body.focus)
    ? body.focus.map(value=>clean(value,120)).filter(Boolean).slice(0,12)
    : [];
  const history=Array.isArray(body&&body.history)
    ? body.history.slice(-12).map(item=>({
        role:item&&item.role==='assistant'?'assistant':'user',
        text:clean(item&&item.text,1200)
      })).filter(item=>item.text)
    : [];
  const message=clean(body&&body.message,1200);
  const locale=body&&body.locale==='en'?'en':'ru';

  return [
    'UNMUTE_TALK_V1',
    'You are a supportive English conversation partner for a learner.',
    'Keep the conversation natural and concise. Do not quiz unless the scenario asks for it.',
    'Reply primarily in English. Use '+(locale==='ru'?'Russian':'English')+' only for a short correction/note when useful.',
    'Never output markdown. Return ONLY JSON with keys: reply, optional correction, optional note.',
    'reply: the next natural line in English, <= 120 words.',
    'correction: only when the learner made an important English mistake; show a better phrase, otherwise omit.',
    'note: one brief learning hint, otherwise omit.',
    'Topic: '+topic,
    'Focus: '+(focus.join(', ')||'general conversation'),
    template?'Scenario instruction: '+template:'',
    'Conversation so far: '+JSON.stringify(history),
    'Learner says: '+message
  ].filter(Boolean).join('\n');
}

const registry=createAIActionRegistry([
  {
    id:'talk.reply',
    type:'text',
    bucket:'light',
    allowWithoutPremium:allowTalkTrial,
    validate:out=>parseTalkResponse(out&&out.text),
    async run({settings,body,generate}){
      return generate('text',settings,buildTalkPrompt(body),{
        validate:out=>parseTalkResponse(out&&out.text)
      });
    }
  }
],{
  malformedPattern:/talk_json|talk_reply/
});

registerTestResponder((type,prompt)=>{
  if(type==='text'&&String(prompt||'').includes('UNMUTE_TALK_V1')){
    return {text:JSON.stringify({reply:'Sure, what would you like to talk about?',note:'Keep your answer short and natural.'})};
  }
  return null;
});

module.exports={registry,parseTalkResponse,allowTalkTrial,buildTalkPrompt,TRIAL_TURNS};
