import { authClient } from './auth';

export interface TalkMessage {
  role:'user'|'assistant';
  text:string;
}

export interface TalkReply {
  reply:string;
  correction?:string;
  note?:string;
  premium:boolean;
}

function clean(value:unknown,max:number):string{
  return String(value??'').trim().slice(0,max);
}

export async function requestTalkReply(input:{
  conversationId:string;
  topic:string;
  promptTemplate:string;
  focus:string[];
  history:TalkMessage[];
  message:string;
  locale:'ru'|'en';
  fetchImpl?:typeof fetch;
}):Promise<TalkReply>{
  const auth=await authClient.authFields();
  if(!auth)throw Object.assign(new Error('auth_required'),{code:'auth_required',status:401});
  const session=await authClient.getSession();
  const fetchImpl=input.fetchImpl??fetch;
  const response=await fetchImpl('/api/admin?ai_endpoint=1',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      email:auth.email,
      deviceId:auth.deviceId,
      token:auth.syncToken,
      kind:'talk.reply',
      prompt:'talk',
      conversationId:input.conversationId,
      topic:clean(input.topic,500),
      promptTemplate:clean(input.promptTemplate,3000),
      focus:input.focus.map(value=>clean(value,120)).filter(Boolean).slice(0,12),
      history:input.history.slice(-12).map(item=>({role:item.role,text:clean(item.text,1200)})),
      message:clean(input.message,1200),
      locale:input.locale
    })
  });
  let data:any={};
  try{data=await response.json();}catch{}
  if(!response.ok){
    const code=String(data?.error||'ai_failed');
    throw Object.assign(new Error(code),{code,status:response.status,detail:data?.detail});
  }
  let parsed:any;
  try{parsed=JSON.parse(String(data?.text||''));}
  catch{throw Object.assign(new Error('ai_bad_response'),{code:'ai_bad_response',status:502});}
  const reply=clean(parsed?.reply,1200);
  if(!reply)throw Object.assign(new Error('ai_bad_response'),{code:'ai_bad_response',status:502});
  return {
    reply,
    ...(clean(parsed?.correction,600)?{correction:clean(parsed.correction,600)}:{}),
    ...(clean(parsed?.note,600)?{note:clean(parsed.note,600)}:{}),
    premium:Boolean(session?.premium)
  };
}
