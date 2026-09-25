const { collectHealth } = require('../lib/health');

const esc = v => String(v == null ? '' : v)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function label(status){
  if(status === 'ok') return 'Работает';
  if(status === 'warning') return 'Требует внимания';
  return 'Ошибка';
}
function yes(v){ return v ? 'Настроено' : 'Не настроено'; }
function chip(ok, text){ return '<span class="chip '+(ok?'ok':'warn')+'">'+esc(text)+'</span>'; }

function renderHtml(h){
  const p = Object.fromEntries((h.probes || []).map(x=>[x.name,x]));
  const build = h.deployment || {};
  const service = h.services || {};
  const storage = h.storage || {};
  const steps = (storage.steps || []).map(x =>
    '<li><span class="'+(x.ok?'dot ok':'dot bad')+'"></span><b>'+esc(x.name)+'</b>'
      +(x.err?'<small>'+esc(x.err)+'</small>':'')+'</li>'
  ).join('');
  const warnings = (h.warnings || []).map(x=>'<li>'+esc(x)+'</li>').join('');
  const provider = service.ai && service.ai.providers || {};
  const billing = service.billing && service.billing.providers || {};
  const shadow = service.supabase && service.supabase.shadow || {};
  const shadowStats = shadow.stats || {};
  const shadowWrite = shadow.lastWrite || {};
  const shadowParity = shadow.parity || {};
  const shadowReady = shadow.readiness || {};
  const commit = build.commit || '—';

  return '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<meta name="robots" content="noindex,nofollow"><title>Fit Timer — Health</title>'
    +'<style>'
    +':root{color-scheme:dark;--bg:#0d0b13;--card:#17131f;--line:#2a2435;--ink:#f5f1fa;--muted:#9d95a8;--ok:#4fd18b;--warn:#f1b94c;--bad:#ff6b78}'
    +'*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}'
    +'.wrap{max-width:980px;margin:auto;padding:28px 18px 48px}.head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:18px}'
    +'h1{font-size:24px;margin:0 0 5px}.muted{color:var(--muted)}.overall{padding:9px 12px;border:1px solid var(--line);border-radius:10px;font-weight:700}'
    +'.overall.ok{color:var(--ok)}.overall.warning{color:var(--warn)}.overall.error{color:var(--bad)}'
    +'.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.card{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:14px;min-width:0}'
    +'.card h2{font-size:14px;margin:0 0 10px}.metric{font-size:24px;font-weight:750}.sub{font-size:12px;color:var(--muted);margin-top:3px}'
    +'.chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:10px}.chip{font-size:11px;padding:4px 7px;border-radius:999px;background:#211c29;color:var(--muted)}'
    +'.chip.ok{color:var(--ok)}.chip.warn{color:var(--warn)}.section{margin-top:16px}.section h2{font-size:16px;margin:0 0 9px}'
    +'ul{list-style:none;padding:0;margin:0}.checks li{display:grid;grid-template-columns:12px minmax(0,1fr);gap:7px 8px;padding:8px 0;border-bottom:1px solid var(--line)}'
    +'.checks li:last-child{border-bottom:0}.checks small{grid-column:2;color:var(--muted);word-break:break-word}.dot{width:8px;height:8px;border-radius:50%;margin-top:6px;background:var(--muted)}'
    +'.dot.ok{background:var(--ok)}.dot.bad{background:var(--bad)}.warnings li{padding:7px 0;border-bottom:1px solid var(--line);color:var(--warn)}'
    +'details{margin-top:14px}.facts{font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);white-space:pre-wrap;word-break:break-word}'
    +'a{color:inherit} @media(max-width:720px){.grid{grid-template-columns:1fr}.head{display:block}.overall{display:inline-block;margin-top:12px}.wrap{padding:20px 12px 36px}}'
    +'</style></head><body><main class="wrap">'
    +'<div class="head"><div><h1>Fit Timer — состояние сервера</h1><div class="muted">Активная проверка · '+esc(new Date(h.checkedAt).toLocaleString('ru-RU'))+'</div></div>'
    +'<div class="overall '+esc(h.status)+'">'+esc(label(h.status))+'</div></div>'
    +'<div class="grid">'
    +'<section class="card"><h2>Хранилище</h2><div class="metric">'+(storage.status==='ok'?'OK':'ERROR')+'</div><div class="sub">'+esc(storage.mode)+' · '+esc(storage.latencyMs==null?'—':storage.latencyMs+' мс')+'</div>'
    +'<div class="chips">'+chip(storage.status==='ok','запись/чтение')+chip(!!(p.catalog&&p.catalog.ok),'каталог')+chip(!!(p.accounts&&p.accounts.ok),'аккаунты')+'</div></section>'
    +'<section class="card"><h2>Сервисы</h2><div class="chips">'
    +chip(!!(service.mail&&service.mail.configured),'Email · '+yes(service.mail&&service.mail.configured))
    +chip(!!(service.ai&&service.ai.configured),'AI · '+yes(service.ai&&service.ai.configured))
    +chip(!!(service.supabase&&service.supabase.connected),'Supabase · '+(service.supabase&&service.supabase.configured?(service.supabase.connected?'подключён':'ошибка'):'не подключён'))
    +chip(!!(service.push&&service.push.android),'Push Android · '+yes(service.push&&service.push.android))
    +chip(!!(service.push&&service.push.ios),'Push iOS · '+yes(service.push&&service.push.ios))
    +'</div></section>'
    +'<section class="card"><h2>Деплой</h2><div class="metric">'+esc(commit)+'</div><div class="sub">'+esc(build.env||'локально')+(build.region?' · '+esc(build.region):'')+'</div>'
    +'<div class="chips">'+chip(!!build.onVercel,build.onVercel?'Vercel':'локальный запуск')+'</div></section>'
    +'</div>'
    +(service.supabase&&service.supabase.configured?'<section class="section card"><h2>Supabase migration</h2><div class="chips">'+chip(!!shadow.writeEnabled,'shadow write · '+(shadow.writeEnabled?'on':'off'))+chip(!!shadow.compareEnabled,'compare · '+(shadow.compareEnabled?'on':'off'))+chip(!!shadowReady.readyForCompare,'ready for compare · '+(shadowReady.readyForCompare?'yes':'no'))+'</div><div class="facts" style="margin-top:10px">documents: '+esc(shadowStats.documents==null?'—':shadowStats.documents)+'\nlast write failed: '+esc(shadowWrite.failed==null?'—':shadowWrite.failed)+'\nlast parity missing/mismatched/extra: '+esc(shadowParity.missing==null?'—':shadowParity.missing)+'/'+esc(shadowParity.mismatched==null?'—':shadowParity.mismatched)+'/'+esc(shadowParity.extra==null?'—':shadowParity.extra)+'\nstage: '+esc(shadowReady.stage||'—')+'\n'+esc(shadowReady.reason||'')+'</div></section>':'')
    +'<section class="section card"><h2>Критичные проверки</h2><ul class="checks">'
    +(h.probes||[]).map(x=>'<li><span class="'+(x.ok?'dot ok':'dot bad')+'"></span><b>'+esc(x.name)+' · '+(x.ok?'OK':'ERROR')+' · '+esc(x.latencyMs)+' мс</b>'+(x.error?'<small>'+esc(x.error)+'</small>':'')+'</li>').join('')
    +(steps?'<li><span class="dot '+(storage.status==='ok'?'ok':'bad')+'"></span><b>Redis-команды</b><small><ul class="checks">'+steps+'</ul></small></li>':'')
    +'</ul></section>'
    +(warnings?'<section class="section card"><h2>Что требует внимания</h2><ul class="warnings">'+warnings+'</ul></section>':'')
    +'<details class="section card"><summary>Технические факты</summary><div class="facts">storage env: '+esc((storage.envSeen||[]).join(', ')||'—')
    +'\nmail env: '+esc((service.mail&&service.mail.envSeen||[]).join(', ')||'—')
    +'\nAI: Gemini '+(provider.gemini?'yes':'no')+', OpenAI '+(provider.openai?'yes':'no')+', OpenRouter '+(provider.openrouter?'yes':'no')
    +'\nSupabase env: '+esc((service.supabase&&service.supabase.envSeen||[]).join(', ')||'—')
    +'\nSupabase shadow write: '+((service.supabase&&service.supabase.shadow&&service.supabase.shadow.writeEnabled)?'yes':'no')
    +'\nSupabase shadow compare: '+((service.supabase&&service.supabase.shadow&&service.supabase.shadow.compareEnabled)?'yes':'no')
    +'\nSupabase parity: '+esc(service.supabase&&service.supabase.shadow&&service.supabase.shadow.parity?JSON.stringify(service.supabase.shadow.parity):'—')
    +'\nbilling: Google '+(billing.google?'yes':'no')+', RuStore '+(billing.rustore?'yes':'no')+', YooKassa '+(billing.yookassa?'yes':'no')
    +'\n\nЗначения секретов никогда не выводятся.</div></details>'
    +'</main></body></html>';
}

module.exports = async (req, res) => {
  const h = await collectHealth();
  res.statusCode = h.ok ? 200 : 503;
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  const format = String(req.query && req.query.format || '').toLowerCase();
  if(format === 'json'){
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify(h));
  }
  if(format === 'text'){
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    return res.end([
      'Fit Timer — '+label(h.status),
      'commit: '+((h.deployment&&h.deployment.commit)||'—'),
      ...(h.probes||[]).map(x=>x.name+': '+(x.ok?'OK':'ERROR')+' ('+x.latencyMs+' ms)'+(x.error?' — '+x.error:''))
    ].join('\n'));
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(renderHtml(h));
};
