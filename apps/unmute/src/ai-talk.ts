import { authClient } from './auth';

export interface TalkMessage {
  role:'learner'|'partner';
  text:string;
}

export interface TalkReplyInput {
  topic:string;
  promptTemplate:string;
  focus:string[];
  history:TalkMessage[];
  learnerText:string;
  locale:'ru'|'en';
  start?:boolean;
}

export interface TalkReply {
  reply:string;
  correction:string|null;
  note:string|null;
  usage?:{
    bucket:string;
    used:number;
    limit:number;
  };
}

export interface TalkReviewInput {
  topic:string;
  promptTemplate:string;
  focus:string[];
  history:TalkMessage[];
  locale:'ru'|'en';
}

export interface TalkReviewCorrection {
  original:string|null;
  better:string;
  why:string|null;
}

export interface TalkReview {
  strengths:string[];
  corrections:TalkReviewCorrection[];
  focus:string;
  usage?:{
    bucket:string;
    used:number;
    limit:number;
  };
}

export class TalkAIError extends Error{
  status:number;
  code:string;
  constructor(code:string,status=0){
    super(code);
    this.name='TalkAIError';
    this.status=status;
    this.code=code;
  }
}

function parseReplyText(value:unknown):Omit<TalkReply,'usage'>{
  let parsed:unknown;
  try{parsed=JSON.parse(String(value||''));}
  catch{throw new TalkAIError('ai_bad_response');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new TalkAIError('ai_bad_response');
  const raw=parsed as Record<string,unknown>;
  const reply=String(raw.reply||'').trim();
  if(!reply)throw new TalkAIError('ai_bad_response');
  const optional=(value:unknown)=>{
    const text=String(value||'').trim();
    return text||null;
  };
  return {
    reply:reply.slice(0,600),
    correction:optional(raw.correction)?.slice(0,600)??null,
    note:optional(raw.note)?.slice(0,600)??null
  };
}

export async function requestTalkReply(input:TalkReplyInput):Promise<TalkReply>{
  const auth=await authClient.authFields();
  if(!auth)throw new TalkAIError('auth_required',401);

  const response=await fetch('/api/ai',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      ...auth,
      kind:'talk.reply',
      // Core requires a non-empty request label; the real model prompt is built server-side.
      prompt:'unmute:talk.reply',
      topic:String(input.topic||'').slice(0,300),
      promptTemplate:String(input.promptTemplate||'').slice(0,2400),
      focus:(input.focus||[]).slice(0,12),
      history:(input.history||[]).slice(-12),
      learnerText:String(input.learnerText||'').slice(0,600),
      locale:input.locale,
      start:Boolean(input.start)
    })
  });

  let payload:Record<string,unknown>={};
  try{
    const parsed=await response.json();
    if(parsed&&typeof parsed==='object')payload=parsed as Record<string,unknown>;
  }catch{}

  if(!response.ok||payload.ok===false){
    throw new TalkAIError(
      String(payload.error||payload.code||'ai_failed'),
      response.status
    );
  }

  const reply=parseReplyText(payload.text);
  const rawUsage=payload.usage;
  const usage=rawUsage&&typeof rawUsage==='object'
    ? {
        bucket:String((rawUsage as Record<string,unknown>).bucket||''),
        used:Number((rawUsage as Record<string,unknown>).used||0),
        limit:Number((rawUsage as Record<string,unknown>).limit||0)
      }
    : undefined;

  return usage?{...reply,usage}:reply;
}


function parseReviewText(value:unknown):Omit<TalkReview,'usage'>{
  let parsed:unknown;
  try{parsed=JSON.parse(String(value||''));}
  catch{throw new TalkAIError('ai_bad_response');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new TalkAIError('ai_bad_response');
  const raw=parsed as Record<string,unknown>;
  const strengths=(Array.isArray(raw.strengths)?raw.strengths:[])
    .map(item=>String(item||'').trim()).filter(Boolean).slice(0,3);
  const corrections=(Array.isArray(raw.corrections)?raw.corrections:[])
    .map(item=>{
      if(!item||typeof item!=='object'||Array.isArray(item))return null;
      const value=item as Record<string,unknown>;
      const better=String(value.better||'').trim();
      if(!better)return null;
      const original=String(value.original||'').trim()||null;
      const why=String(value.why||'').trim()||null;
      return {
        original:original?.slice(0,400)??null,
        better:better.slice(0,400),
        why:why?.slice(0,400)??null
      };
    })
    .filter((item):item is TalkReviewCorrection=>item!==null)
    .slice(0,3);
  const focus=String(raw.focus||'').trim();
  if(!strengths.length||!focus)throw new TalkAIError('ai_bad_response');
  return {
    strengths:strengths.map(item=>item.slice(0,320)),
    corrections,
    focus:focus.slice(0,400)
  };
}

export async function requestTalkReview(input:TalkReviewInput):Promise<TalkReview>{
  const auth=await authClient.authFields();
  if(!auth)throw new TalkAIError('auth_required',401);

  const response=await fetch('/api/ai',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      ...auth,
      kind:'talk.review',
      prompt:'unmute:talk.review',
      topic:String(input.topic||'').slice(0,300),
      promptTemplate:String(input.promptTemplate||'').slice(0,2400),
      focus:(input.focus||[]).slice(0,12),
      history:(input.history||[]).slice(-12),
      locale:input.locale
    })
  });

  let payload:Record<string,unknown>={};
  try{
    const parsed=await response.json();
    if(parsed&&typeof parsed==='object')payload=parsed as Record<string,unknown>;
  }catch{}

  if(!response.ok||payload.ok===false){
    throw new TalkAIError(
      String(payload.error||payload.code||'ai_failed'),
      response.status
    );
  }

  const review=parseReviewText(payload.text);
  const rawUsage=payload.usage;
  const usage=rawUsage&&typeof rawUsage==='object'
    ? {
        bucket:String((rawUsage as Record<string,unknown>).bucket||''),
        used:Number((rawUsage as Record<string,unknown>).used||0),
        limit:Number((rawUsage as Record<string,unknown>).limit||0)
      }
    : undefined;
  return usage?{...review,usage}:review;
}

export const talkReplyProtocol={parseReplyText,parseReviewText};
