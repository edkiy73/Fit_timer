import { authClient } from './auth';
import { apiUrl } from './api-url';

export interface AnswerExplainInput {
  question:string;
  learnerAnswer:string;
  acceptedAnswers:string[];
  courseExplanation?:string;
  locale:'ru'|'en';
}

export interface AnswerExplanation {
  why:string;
  tip:string;
  usage?:{
    bucket:string;
    used:number;
    limit:number;
  };
  /** Set when this was one of the free explanations (no Plus). */
  freeRemaining?:number;
  freeLimit?:number;
}

export class AnswerAIError extends Error{
  status:number;
  code:string;
  constructor(code:string,status=0){
    super(code);
    this.name='AnswerAIError';
    this.status=status;
    this.code=code;
  }
}

function parseAnswerExplanation(value:unknown):Omit<AnswerExplanation,'usage'>{
  let parsed:unknown;
  try{parsed=JSON.parse(String(value||''));}
  catch{throw new AnswerAIError('ai_bad_response');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)){
    throw new AnswerAIError('ai_bad_response');
  }
  const raw=parsed as Record<string,unknown>;
  const why=String(raw.why||'').trim();
  const tip=String(raw.tip||'').trim();
  if(!why||!tip)throw new AnswerAIError('ai_bad_response');
  return {
    why:why.slice(0,600),
    tip:tip.slice(0,400)
  };
}

export async function requestAnswerExplanation(
  input:AnswerExplainInput
):Promise<AnswerExplanation>{
  const auth=await authClient.authFields();
  if(!auth)throw new AnswerAIError('auth_required',401);

  const response=await fetch(apiUrl('/api/ai'),{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      ...auth,
      kind:'answer.explain',
      prompt:'unmute:answer.explain',
      question:String(input.question||'').slice(0,700),
      learnerAnswer:String(input.learnerAnswer||'').slice(0,500),
      acceptedAnswers:(input.acceptedAnswers||[]).slice(0,8),
      courseExplanation:String(input.courseExplanation||'').slice(0,800),
      locale:input.locale
    })
  });

  let payload:Record<string,unknown>={};
  try{
    const parsed=await response.json();
    if(parsed&&typeof parsed==='object')payload=parsed as Record<string,unknown>;
  }catch{}

  if(!response.ok||payload.ok===false){
    throw new AnswerAIError(
      String(payload.error||payload.code||'ai_failed'),
      response.status
    );
  }

  const explanation=parseAnswerExplanation(payload.text);
  const rawUsage=payload.usage;
  const usage=rawUsage&&typeof rawUsage==='object'
    ? {
        bucket:String((rawUsage as Record<string,unknown>).bucket||''),
        used:Number((rawUsage as Record<string,unknown>).used||0),
        limit:Number((rawUsage as Record<string,unknown>).limit||0)
      }
    : undefined;

  const access=payload.access&&typeof payload.access==='object'?payload.access as Record<string,unknown>:null;
  const result:AnswerExplanation=usage?{...explanation,usage}:{...explanation};
  if(access?.mode==='free'){
    result.freeRemaining=Math.max(0,Number(access.remaining)||0);
    result.freeLimit=Math.max(0,Number(access.maxCalls)||0);
  }
  return result;
}

export const answerExplainProtocol={parseAnswerExplanation};
