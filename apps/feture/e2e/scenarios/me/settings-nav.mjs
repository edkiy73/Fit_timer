// «Я» → settings and back (owner 28.10.2026: «в настройках аккаунта тоже все прыгает при переходах между экранами»),
// lane `ps`, CPU 4× slower: each step taps in-app (no reload), then for 2.5 s records layout shifts (PerformanceObserver)
// and whether a skeleton shows. The first visit of a screen may show its skeleton once (blocks of its size); a revisit
// never does, and nothing moves under the reader after the first frame.
import { expect } from '../helpers.mjs';

const STEPS = [
  ['Я', '/n/me'], ['Настройки', '/n/settings'], ['Уведомления', '/n/settings/notifications'], ['← Настройки', -1],
  ['Вход и безопасность', '/n/settings/security'], ['← Настройки', -1], ['Заблокированные', '/n/settings/blocked'], ['← Настройки', -1],
  ['Проверка возраста', '/n/settings/age'], ['← Настройки', -1], ['Проверка фото', '/n/settings/photo-check'], ['← Настройки', -1],
  ['Premium', '/n/premium'], ['← Настройки', -1], ['← Я', -1], ['Я · Видимость', '/n/me?layer=vis'], ['Я · Профиль', '/n/me'],
  ['Настройки (снова)', '/n/settings'], ['Уведомления (снова)', '/n/settings/notifications'], ['← Настройки', -1], ['← Я', -1],
];

export default [
 { name: 'Я → settings subscreens and back (CPU 4×): no layout shift, no skeleton on a revisit', persona: 'basic', run: async t => {
   const p = t.page;
   await p.setViewportSize({ width: 390, height: 844 });
   await t.go('/n/me'); await t.wait(3000);
   const cdp = await p.context().newCDPSession(p);
   await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
   const seen = new Set(); const rows = []; let total = 0; let badRevisits = 0;
   for (const [label, to] of STEPS) {
     await p.evaluate(() => { const w = /** @type {any} */ (window); w.__cls = 0; w.__skel = 0; w.__src = new Set(); w.__po?.disconnect(); w.__mo?.disconnect();
       w.__po = new PerformanceObserver(l => { for (const e of /** @type {any[]} */ (l.getEntries())) if (!e.hadRecentInput) { w.__cls += e.value; for (const x of e.sources ?? []) { const n = x.node; w.__src.add(n ? (n.nodeName + '.' + String(n.className ?? '').split(' ').slice(0, 2).join('.') + ' ' + Math.round(x.previousRect.y) + '→' + Math.round(x.currentRect.y)) : '?'); } } }); w.__po.observe({ type: 'layout-shift' });
       w.__mo = new MutationObserver(() => { if (document.querySelector('.main .skel, .view .skel')) w.__skel++; }); w.__mo.observe(document.body, { subtree: true, childList: true }); });
     // In-app navigation, as a tap would do it (the router listens to the hash).
     if (to === -1) await p.evaluate(() => history.back());
     else await p.evaluate(r => { location.hash = '#' + r; }, to);
     await t.wait(2500);
     const r = await p.evaluate(() => { const w = /** @type {any} */ (window); return { cls: Math.round(w.__cls * 1e4) / 1e4, skel: w.__skel, src: [...w.__src].slice(0, 4).join(', ') }; });
     const path = await p.evaluate(() => location.hash.slice(1));
     const again = seen.has(path); seen.add(path);
     rows.push(`${label.padEnd(22)} CLS ${String(r.cls).padEnd(7)} skeleton ${r.skel ? 'yes' : 'no '}${again ? ' (revisit)' : ''}${r.cls ? '  ← ' + r.src : ''}`);
     total += r.cls; if (again && r.skel) badRevisits++;
   }
   await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
   console.log('   ' + rows.join('\n   '));
   console.log(`   total CLS ${Math.round(total * 1e4) / 1e4}, revisits with a skeleton: ${badRevisits}`);
   expect(total < 0.05, 'layout moved during the walk: CLS ' + total);
   expect(badRevisits === 0, 'a revisited screen showed its skeleton');
 } },
];
