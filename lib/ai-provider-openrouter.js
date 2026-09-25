'use strict';

const API_URL='https://openrouter.ai/api/v1/chat/completions';

function configured(){
  return !!String(process.env.OPENROUTER_API_KEY||'').trim();
}

function info(){
  return {
    configured:configured(),
    envSeen:Object.keys(process.env).filter(k=>/^OPENROUTER_/.test(k)).sort()
  };
}

function contentText(content){
  if(typeof content==='string') return content.trim();
  if(Array.isArray(content)){
    return content.map(part=>{
      if(typeof part==='string') return part;
      if(part && typeof part.text==='string') return part.text;
      return '';
    }).join('').trim();
  }
  return '';
}

async function generateText({model,prompt,timeoutMs=48000,maxTokens=32768,temperature=.3,fetchTimed,jsonError}){
  if(!configured()) throw Object.assign(new Error('provider_not_configured'),{status:503});
  const headers={
    'Content-Type':'application/json',
    Authorization:'Bearer '+String(process.env.OPENROUTER_API_KEY||'').trim()
  };
  const referer=String(process.env.OPENROUTER_APP_URL||'').trim();
  const title=String(process.env.OPENROUTER_APP_NAME||'').trim();
  if(/^https:\/\//i.test(referer)) headers['HTTP-Referer']=referer.slice(0,500);
  if(title) headers['X-Title']=title.slice(0,100);

  const res=await fetchTimed(API_URL,{
    method:'POST',
    headers,
    body:JSON.stringify({
      model:String(model||'').trim(),
      messages:[{role:'user',content:String(prompt||'')}],
      max_tokens:Math.max(1,Math.min(65536,Math.round(+maxTokens||32768))),
      temperature:Number.isFinite(+temperature)?+temperature:.3
    })
  },timeoutMs);

  if(!res.ok) return jsonError(res);
  const j=await res.json();
  const text=contentText((((j.choices||[])[0]||{}).message||{}).content);
  if(!text) throw Object.assign(new Error('empty_response'),{status:502});
  return {
    text,
    usage:j.usage&&typeof j.usage==='object'?j.usage:undefined
  };
}

module.exports={configured,info,generateText};
