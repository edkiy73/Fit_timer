/* Abuse regression: OTP и базовые auth-лимиты без браузера.
   Запуск:
     node tests/dev-server.js 8124
     node tests/auth-abuse.js
*/
const BASE = process.env.FIT_URL || 'http://localhost:8124';
const MAIL = 'abuse-' + Math.random().toString(36).slice(2,8) + '@example.com';
let bad = 0;
const ok = (name, cond, extra) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra == null ? '' : ' → ' + extra));
};
async function post(body){
  const r = await fetch(BASE + '/api/auth', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  });
  const j = await r.json();
  return {status:r.status, body:j};
}

(async()=>{
  const badAdmin = await fetch(BASE + '/api/admin', {
    method:'POST',
    headers:{'content-type':'application/json','x-admin-key':'wrong'},
    body:JSON.stringify({action:'overview'})
  });
  const badAdminBody = await badAdmin.json();
  ok('неверный admin key не пускает',
     badAdmin.status === 403 && badAdminBody.error === 'bad_key',
     badAdmin.status + ' ' + JSON.stringify(badAdminBody));

  // Суточный предел по одному адресу: первые пять писем разрешены.
  let first;
  for(let i=0;i<5;i++){
    const r = await post({action:'send',email:MAIL});
    if(i===0) first = r;
    ok('OTP письмо ' + (i+1) + ' проходит', r.status === 200, r.status + ' ' + JSON.stringify(r.body));
  }
  const sixth = await post({action:'send',email:MAIL});
  ok('шестое OTP письмо за сутки блокируется',
     sixth.status === 429 && sixth.body.error === 'too_many_today',
     sixth.status + ' ' + JSON.stringify(sixth.body));

  // Один код нельзя перебирать бесконечно: после пяти ошибок он уничтожается.
  const VERIFY_MAIL = 'verify-' + Math.random().toString(36).slice(2,8) + '@example.com';
  const sent = await post({action:'send',email:VERIFY_MAIL});
  ok('код для проверки перебора создан', sent.status === 200 && sent.body.devCode, JSON.stringify(sent.body));
  for(let i=0;i<5;i++){
    const r = await post({action:'verify',email:VERIFY_MAIL,code:'000000',deviceId:'abuse-device'});
    ok('неверный код ' + (i+1) + ' не пускает',
       r.status === 403 && r.body.error === 'bad_code',
       r.status + ' ' + JSON.stringify(r.body));
  }
  const over = await post({action:'verify',email:VERIFY_MAIL,code:'000000',deviceId:'abuse-device'});
  ok('после лимита перебор блокируется',
     over.status === 429 && over.body.error === 'too_many_tries',
     over.status + ' ' + JSON.stringify(over.body));

  process.exit(bad ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
