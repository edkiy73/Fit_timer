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


function parseTalkReview(text){
  let parsed;
  try{parsed=JSON.parse(String(text||''));}
  catch(_){return {ok:false,reason:'talk_review_invalid_json',missing:['strengths','focus']};}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)){
    return {ok:false,reason:'talk_review_invalid_object',missing:['strengths','focus']};
  }
  const strengths=(Array.isArray(parsed.strengths)?parsed.strengths:[])
    .map(item=>line(item,320)).filter(Boolean).slice(0,3);
  const corrections=(Array.isArray(parsed.corrections)?parsed.corrections:[])
    .map(item=>{
      if(!item||typeof item!=='object'||Array.isArray(item))return null;
      const original=line(item.original,400);
      const better=line(item.better,400);
      const why=line(item.why,400);
      if(!better)return null;
      return {original:original||null,better,why:why||null};
    }).filter(Boolean).slice(0,3);
  const focus=line(parsed.focus,400);
  if(!strengths.length)return {ok:false,reason:'talk_review_missing_strengths',missing:['strengths']};
  if(!focus)return {ok:false,reason:'talk_review_missing_focus',missing:['focus']};
  return {
    ok:true,
    text:JSON.stringify({strengths,corrections,focus})
  };
}

function buildTalkReviewPrompt(body){
  const locale=cleanLocale(body&&body.locale);
  const topic=line(body&&body.topic,300);
  const promptTemplate=line(body&&body.promptTemplate,2400);
  const targetFocus=Array.isArray(body&&body.focus)
    ? body.focus.map(item=>line(item,120)).filter(Boolean).slice(0,12)
    : [];
  const history=cleanHistory(body&&body.history);
  if(!topic||!history.some(item=>item.role==='learner')){
    throw Object.assign(new Error('talk_review_bad_input'),{status:400,code:'talk_review_bad_input'});
  }
  const transcript=history.map(item=>
    (item.role==='partner'?'PARTNER':'LEARNER')+': '+item.text
  ).join('\n');
  return [
    'You review a completed English practice conversation inside UnMute.',
    'Use ONLY the transcript below. Do not invent mistakes or facts that are not present.',
    'Give 1-3 concise strengths based on what the learner actually did well.',
    'Give 0-3 corrections only for meaningful English problems. Skip tiny stylistic preferences.',
    'For each correction, ORIGINAL is the learner wording, BETTER is a natural corrected version, WHY is one short explanation.',
    'Give one concrete FOCUS for the learner’s next attempt.',
    targetFocus.length?'COURSE TARGET PATTERNS: '+targetFocus.join(' | '):'',
    promptTemplate?'SCENARIO INSTRUCTIONS: '+promptTemplate:'',
    'TOPIC: '+topic,
    'TRANSCRIPT:\n'+transcript,
    locale==='ru'
      ? 'Write strengths, WHY explanations and FOCUS in Russian. Keep ORIGINAL and BETTER in English.'
      : 'Write strengths, WHY explanations and FOCUS in English. Keep ORIGINAL and BETTER in English.',
    'Return ONLY strict JSON with this exact shape:',
    '{"strengths":["..."],"corrections":[{"original":"...","better":"...","why":"..."}],"focus":"..."}',
    'Do not use Markdown. Do not add keys.'
  ].filter(Boolean).join('\n\n');
}

function cleanAccepted(value){
  if(!Array.isArray(value))return [];
  return value.map(item=>line(item,300)).filter(Boolean).slice(0,8);
}

function parseAnswerExplain(text){
  let parsed;
  try{parsed=JSON.parse(String(text||''));}
  catch(_){return {ok:false,reason:'answer_explain_invalid_json',missing:['why','tip']};}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)){
    return {ok:false,reason:'answer_explain_invalid_object',missing:['why','tip']};
  }
  const why=line(parsed.why,600);
  const tip=line(parsed.tip,400);
  if(!why)return {ok:false,reason:'answer_explain_missing_why',missing:['why']};
  if(!tip)return {ok:false,reason:'answer_explain_missing_tip',missing:['tip']};
  return {
    ok:true,
    text:JSON.stringify({why,tip})
  };
}

function buildAnswerExplainPrompt(body){
  const locale=cleanLocale(body&&body.locale);
  const question=line(body&&body.question,700);
  const learnerAnswer=line(body&&body.learnerAnswer,500);
  const accepted=cleanAccepted(body&&body.acceptedAnswers);
  const courseExplanation=line(body&&body.courseExplanation,800);
  if(!question||!learnerAnswer||!accepted.length){
    throw Object.assign(new Error('answer_explain_bad_input'),{status:400,code:'answer_explain_bad_input'});
  }

  return [
    'You explain one wrong English-learning answer inside UnMute.',
    'Use ONLY the task, learner answer, accepted answers, and optional course explanation below.',
    'Do not invent a new grading rule and do not claim another answer is required if it is not in ACCEPTED ANSWERS.',
    'Explain the most useful reason the learner answer did not match, in plain language and without long grammar lectures.',
    'Give one short practical tip that helps answer a similar task next time.',
    'TASK: '+question,
    'LEARNER ANSWER: '+learnerAnswer,
    'ACCEPTED ANSWERS: '+accepted.join(' | '),
    courseExplanation?'COURSE EXPLANATION: '+courseExplanation:'',
    locale==='ru'
      ? 'Write WHY and TIP in Russian. English examples may stay in English.'
      : 'Write WHY and TIP in English.',
    'Return ONLY strict JSON with this exact shape:',
    '{"why":"...","tip":"..."}',
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
  },
  {
    id:'talk.review',
    type:'text',
    bucket:'light',
    async run({settings,body,generate}){
      const prompt=buildTalkReviewPrompt(body||{});
      return generate('text',settings,prompt,{validate:out=>parseTalkReview(out&&out.text)});
    },
    publicError(error){
      if(error&&String(error.code||error.message||'')==='talk_review_bad_input'){
        return {status:400,code:'talk_review_bad_input'};
      }
      return null;
    }
  },
  {
    id:'answer.explain',
    type:'text',
    bucket:'light',
    async run({settings,body,generate}){
      const prompt=buildAnswerExplainPrompt(body||{});
      return generate('text',settings,prompt,{validate:out=>parseAnswerExplain(out&&out.text)});
    },
    publicError(error){
      if(error&&String(error.code||error.message||'')==='answer_explain_bad_input'){
        return {status:400,code:'answer_explain_bad_input'};
      }
      return null;
    }
  }
],{
  malformedPattern:/talk_invalid_json|talk_invalid_object|talk_missing_reply|talk_review_invalid_json|talk_review_invalid_object|talk_review_missing_strengths|talk_review_missing_focus|answer_explain_invalid_json|answer_explain_invalid_object|answer_explain_missing_why|answer_explain_missing_tip/
});

module.exports={
  registry,
  buildTalkPrompt,
  parseReply,
  cleanHistory,
  buildTalkReviewPrompt,
  parseTalkReview,
  buildAnswerExplainPrompt,
  parseAnswerExplain
};
