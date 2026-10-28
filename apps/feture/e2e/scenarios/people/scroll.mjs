// «Люди» card scroll (owner 28.10.2026: «вниз не проскролить нормально… моргает при скролле и вылетает в новую
// загрузку»), lane `ps`: on a phone with the CPU slowed 4×, the top card is scrolled from the photo to its last line.
// Nothing may move under the reader (layout shifts, PerformanceObserver), no skeleton may show after the card's body
// is drawn, and scrolling asks the server nothing. Then the next card: it was read while it waited (one request per
// card), so after a swipe its body is whole at once. `basic` looks in «peek» mode (hidden itself; passes only).
import { expect } from '../helpers.mjs';

/** Scrolls the top card to its end in wheel-sized steps and returns what moved and what showed meanwhile. */
async function scrollCard(p) {
  return p.evaluate(async () => {
    const el = document.querySelector('.deck .pc.top'); if (!el) return null;
    let cls = 0; const shifts = [];
    const po = new PerformanceObserver(l => { for (const e of /** @type {any[]} */ (l.getEntries())) if (!e.hadRecentInput) { cls += e.value; shifts.push(Math.round(e.value * 1e4) / 1e4); } });
    po.observe({ type: 'layout-shift', buffered: false });
    let skel = 0; const mo = new MutationObserver(() => { if (el.querySelector('.skel')) skel++; }); mo.observe(el, { subtree: true, childList: true });
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const heights = new Set(); let steps = 0;
    for (let y = 0; y < el.scrollHeight && steps < 400; y += 120, steps++) { el.scrollTop = y; await frame(); heights.add(el.scrollHeight); }
    el.scrollTop = el.scrollHeight; await new Promise(r => setTimeout(r, 600));
    po.disconnect(); mo.disconnect();
    return { cls: Math.round(cls * 1e4) / 1e4, shifts: shifts.slice(0, 10), skel, steps, heights: [...heights], end: el.scrollTop + el.clientHeight >= el.scrollHeight - 2 };
  });
}

export default [
 { name: 'D03 card: scrolled top→bottom (CPU 4×) — no layout shift, no skeleton, no request; the next card is whole after a swipe', persona: 'basic', allow4xx: true, run: async t => {
   const p = t.page;
   await t.api('profile.setVisibility', { opId: t.uuid7(), setting: 'discoverMode', value: 'hidden' });
   const cdp = await p.context().newCDPSession(p);
   await p.setViewportSize({ width: 390, height: 844 });
   const actions = [];
   p.on('request', r => { if (!r.url().includes('/api/fe')) return; try { actions.push(JSON.parse(r.postData() || '{}').action); } catch {} });
   await t.go('/n/people');
   const top = p.locator('.deck .pc.top'); await top.waitFor({ timeout: 30000 });
   // The body is drawn once (blocks of its size until then): wait for it, as a person looking at the photo would.
   await p.waitForFunction(() => { const el = document.querySelector('.deck .pc.top .pc-body'); return el && !el.querySelector('.skel'); }, null, { timeout: 30000 }).catch(() => {});
   await t.wait(1500);
   await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
   const before = actions.length;
   const r1 = await scrollCard(p);
   const during = actions.slice(before);
   console.log(`   card 1: CLS ${r1.cls} ${JSON.stringify(r1.shifts)}, skeleton ${r1.skel}×, ${r1.steps} steps, heights ${r1.heights.join('/')}, requests while scrolling: ${during.join(', ') || 'none'}`);
   expect(r1.end, 'scrolled to the end of the card');
   expect(r1.cls < 0.01, 'layout moved while scrolling: CLS ' + r1.cls);
   expect(r1.skel === 0, 'a skeleton showed while scrolling');
   expect(r1.heights.length === 1, 'the card grew while scrolling: ' + r1.heights.join('/'));
   expect(during.length === 0, 'requests while scrolling: ' + during.join(', '));
   await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

   // Next card: read while it waited, so after the swipe its body is there on the first frame.
   await p.evaluate(() => { const el = document.querySelector('.deck .pc.top'); if (el) el.scrollTop = 0; });
   await t.wait(2500);
   const afterSwipe = actions.length;
   await p.keyboard.press('ArrowLeft');
   await p.waitForFunction(prev => document.querySelector('.deck .pc.top')?.getAttribute('aria-label') !== prev, await top.getAttribute('aria-label'), { timeout: 10000 });
   await t.wait(400);
   const whole = await p.evaluate(() => { const b = document.querySelector('.deck .pc.top .pc-body'); return !!b && !b.querySelector('.skel'); });
   await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
   const r2 = await scrollCard(p);
   await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
   const swipeReqs = actions.slice(afterSwipe);
   console.log(`   card 2: whole at once ${whole}; CLS ${r2.cls}, skeleton ${r2.skel}×; requests for the swipe and the scroll: ${swipeReqs.join(', ')}`);
   expect(r2.cls < 0.01 && r2.skel === 0, `the second card moved or loaded while scrolled: CLS ${r2.cls}, skeleton ${r2.skel}`);
   // With the one read on the server a swipe costs the decision and the card after next (2); without it the parts
   // of the card someone stays on (more, but only after a pause).
   if (swipeReqs.includes('discover.card')) {
     expect(whole, 'the next card was not whole right after the swipe');
     expect(swipeReqs.filter(a => a !== 'discover.decide' && a !== 'discover.card').length === 0, 'other reads for a swipe: ' + swipeReqs.join(', '));
   }
 } },
];
