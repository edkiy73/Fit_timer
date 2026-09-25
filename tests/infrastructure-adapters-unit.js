/* Infrastructure adapter foundation regression. */
let bad=0;
const ok=(name,cond,extra)=>{
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name+(extra==null?'':' → '+extra));
};

process.env.SUPABASE_URL='https://demo-project.supabase.co';
process.env.SUPABASE_SECRET_KEY='sb_secret_test_never_print';
const Supabase=require('../lib/supabase');

const info=Supabase.info();
ok('Supabase adapter sees server configuration',info.configured===true,JSON.stringify(info));
ok('Supabase info never exposes secret value',
  !JSON.stringify(info).includes('sb_secret_test_never_print'),
  JSON.stringify(info));

let seen=null;
const originalFetch=global.fetch;
global.fetch=async (url,opts)=>{
  seen={url:String(url),headers:opts&&opts.headers||{}};
  return {ok:true,status:200,text:async()=>'',json:async()=>({})};
};

(async()=>{
  try{
    const result=await Supabase.selfTest();
    ok('Supabase selfTest hits PostgREST root',result.ok===true&&/\/rest\/v1\/$/.test(seen.url),seen&&seen.url);
    ok('Supabase secret stays in server request headers',
      seen.headers.apikey==='sb_secret_test_never_print'
      && seen.headers.Authorization==='Bearer sb_secret_test_never_print');
  }catch(e){
    ok('Supabase selfTest does not fail',false,e&&e.message);
  }finally{
    global.fetch=originalFetch;
  }

  process.env.OPENROUTER_API_KEY='or_test_secret';
  const OpenRouter=require('../lib/ai-provider-openrouter');
  let request=null;
  const fetchTimed=async(url,opts)=>{
    request={url:String(url),opts};
    return {
      ok:true,status:200,
      json:async()=>({
        choices:[{message:{content:'demo answer'}}],
        usage:{prompt_tokens:3,completion_tokens:2}
      })
    };
  };
  const out=await OpenRouter.generateText({
    model:'demo/model',
    prompt:'hello',
    fetchTimed,
    jsonError:async()=>{throw new Error('unexpected');}
  });
  ok('OpenRouter adapter uses chat completions endpoint',
    request&&request.url==='https://openrouter.ai/api/v1/chat/completions',
    request&&request.url);
  ok('OpenRouter adapter sends normalized model/messages',
    JSON.parse(request.opts.body).model==='demo/model'
    && JSON.parse(request.opts.body).messages[0].content==='hello');
  ok('OpenRouter adapter keeps API key in Authorization header',
    request.opts.headers.Authorization==='Bearer or_test_secret');
  ok('OpenRouter adapter normalizes text response',out.text==='demo answer');

  process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
