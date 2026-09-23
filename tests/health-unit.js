/* Structured /api/health regression.
   dev-server uses the in-memory store, so the same active SET/GET/list probes can
   run in CI without external credentials. */
const BASE=process.env.FIT_URL||'http://127.0.0.1:8124';
let bad=0;
const ok=(name,v,extra)=>{if(!v)bad++;console.log((v?'  ok  ':' ПЛОХО')+'  '+name+(extra?' → '+extra:''));};

(async()=>{
  const jr=await fetch(BASE+'/api/health?format=json');
  const j=await jr.json();
  ok('health JSON отвечает',jr.status===200,j.status);
  ok('есть общий структурированный статус',j.ok===true&&['ok','warning'].includes(j.status),j.status);
  ok('хранилище проверено активными операциями',j.storage&&j.storage.status==='ok'&&(j.storage.steps||[]).length>=5);
  ok('все Redis/storage шаги прошли',(j.storage.steps||[]).every(x=>x.ok));
  const probes=Object.fromEntries((j.probes||[]).map(x=>[x.name,x]));
  ok('проверено чтение каталога',probes.catalog&&probes.catalog.ok===true);
  ok('проверен индекс аккаунтов',probes.accounts&&probes.accounts.ok===true);
  ok('есть безопасная информация о деплое',j.deployment&&Object.prototype.hasOwnProperty.call(j.deployment,'commit'));
  ok('секретные значения не возвращаются',!JSON.stringify(j).includes('testadminkey123456'));

  const hr=await fetch(BASE+'/api/health');
  const html=await hr.text();
  ok('обычный health теперь читаемый HTML',/text\/html/.test(hr.headers.get('content-type')||'')&&/состояние сервера/i.test(html));
  ok('HTML показывает критичные проверки',/Критичные проверки/.test(html)&&/Хранилище/.test(html));

  process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
