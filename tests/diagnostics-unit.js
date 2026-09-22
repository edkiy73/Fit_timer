process.env.ALLOW_MEMORY_STORE='1';
const {recordClientError,clientErrorStats,redact}=require('../lib/diagnostics');
let bad=0;
const ok=(n,c,e)=>{if(!c)bad++;console.log((c?'  ok  ':' ПЛОХО')+'  '+n+(e==null?'':' → '+e));};
(async()=>{
  await recordClientError({kind:'error',name:'TypeError',message:'Failed for "secret program" user@example.com https://example.com/x?a=1',stack:'TypeError: boom\n at https://example.com/app.js:10:2',platform:'android',locale:'ru'});
  await recordClientError({kind:'error',name:'TypeError',message:'Failed for "secret program" user@example.com https://example.com/x?a=1',stack:'TypeError: boom\n at https://example.com/app.js:10:2',platform:'android',locale:'ru'});
  const d=await clientErrorStats(), x=d.items[0]||{};
  ok('одинаковая ошибка группируется',d.items.length===1&&x.count===2,JSON.stringify({items:d.items.length,count:x.count}));
  ok('email удалён',!String(x.message).includes('user@example.com'),x.message);
  ok('URL удалён',!String(x.message+x.stack).includes('example.com'),x.message);
  ok('строка пользователя в кавычках удалена',!String(x.message).includes('secret program'),x.message);
  ok('платформа остаётся только агрегатом',x.platform&&x.platform.android===2,JSON.stringify(x.platform));
  ok('redact ограничивает длину',redact('x'.repeat(1000),80).length===80);
  process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
