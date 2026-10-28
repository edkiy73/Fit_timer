// Couple wording fits on a phone (owner 28.10.2026: «главное чтобы они везде умещались хорошо по тексту»). Acting as
// the couple, buttons say «…от пары» / «На согласие партнёру»; at 360 and 390 px (RU and EN) every visible
// button, icon button, pill, chip, row title and toast on the screens and sheets with couple actions must fit: no text
// clipped or spilling out (scrollWidth ≤ clientWidth + 1), nothing wider than the viewport, no word broken in the middle,
// at most two lines in a button and one line where buttons sit side by side. A screenshot of every step lands in
// e2e/out/fit-<width>-<lang>-<step>.png. Lane of your choice; the couple is `pair`, the people it acts on are `mate` and
// `host`. The partner's «approve my changes» is switched on for the partner-approval pass and restored after.
import fs from 'node:fs';
import { expect, sheet } from '../helpers.mjs';

const actAs = (t, id) => t.page.addInitScript(v => { try { sessionStorage.setItem('feture.fe.acting', v); } catch { /* none */ } }, id);
const lang = (t, l) => t.page.addInitScript(v => { try { localStorage.setItem('feture.locale', v); } catch { /* none */ } }, l);
const coupleOf = async t => (await t.boot()).profiles.find(p => p.kind === 'couple' && p.state === 'active');
const COUPLE = /пар[аыуеой]\b|вдвоём|партн[её]р|\bнам\b|\bмы\b|\bвы\b|couple|partner|as us|\bwe\b|\byou two\b/i;

/** Runs in the page: every problem with the fit of what is on top (the open dialog or sheet, else the screen) and toasts. */
function audit() {
  const vw = document.documentElement.clientWidth, out = [];
  const top = document.querySelector('.dialog.on') || document.querySelector('.sheet.on') || document.body;
  const shown = el => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; }
    return true; };
  const scrollsX = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if ((o === 'auto' || o === 'scroll') && e.scrollWidth > e.clientWidth + 1) return true; } return false; };
  const say = el => (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 70);
  const lines = el => { const mids = []; const breaks = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { if (!n.textContent.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n); for (const q of r.getClientRects()) if (q.width > 1 && q.height > 4) mids.push((q.top + q.bottom) / 2);
      const re = /[^\s—–-]{2,}/g; let m; while ((m = re.exec(n.textContent))) { const wr = document.createRange(); wr.setStart(n, m.index); wr.setEnd(n, m.index + m[0].length);
        const ys = [...wr.getClientRects()].filter(q => q.width > 1 && q.height > 4).map(q => Math.round((q.top + q.bottom) / 2));
        if (ys.length > 1 && Math.max(...ys) - Math.min(...ys) > 6) breaks.push(m[0]); } }
    mids.sort((a, b) => a - b); let k = 0, last = -1e9; for (const y of mids) { if (y - last > 6) k++; last = y; } return { n: k, breaks }; };
  const kinds = [['.btn', 'btn'], ['.ibtn', 'ibtn'], ['.pill', 'pill'], ['.chip', 'chip'], ['.li .tx > b', 'row'], ['.toast', 'toast'], ['.dialog.on h2, .sheet.on .sh-h h2, .sheet.on h2', 'title']];
  if (document.documentElement.scrollWidth > vw + 1) out.push({ kind: 'page', text: 'the page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + vw });
  for (const [sel, kind] of kinds) {
    const scope = kind === 'toast' ? document : top;
    for (const el of scope.querySelectorAll(sel)) {
      if (!shown(el)) continue;
      const text = say(el); const r = el.getBoundingClientRect(); const strict = ['btn', 'ibtn', 'pill', 'toast', 'title'].includes(kind) || COUPLE_RE.test(text);
      const add = why => out.push({ kind, text, why, strict });
      if ((r.left < -1 || r.right > vw + 1) && !scrollsX(el)) add('outside the viewport ' + Math.round(r.left) + '…' + Math.round(r.right));
      if (kind !== 'ibtn' && el.scrollWidth > el.clientWidth + 1) add('clipped ' + el.scrollWidth + ' > ' + el.clientWidth); // an icon button's badge sits outside on purpose
      for (const c of el.querySelectorAll('span, b, small, em')) if (shown(c) && c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).overflow !== 'visible') add('inner text clipped «' + say(c) + '»');
      if (kind === 'btn' || kind === 'pill' || kind === 'chip' || kind === 'title' || kind === 'row') {
        const L = lines(el);
        if (L.breaks.length) add('word broken across lines: ' + L.breaks.join(', '));
        if (kind === 'btn' || kind === 'pill' || kind === 'chip') {
          const sibs = [...(el.parentElement?.children ?? [])].filter(s => s !== el && s.matches('.btn, .ibtn, .chip, .pill, button') && shown(s));
          const inRow = sibs.some(s => { const q = s.getBoundingClientRect(); return q.top < r.bottom - 2 && r.top < q.bottom - 2; });
          if (inRow && L.n > 1) add('wraps to ' + L.n + ' lines beside another button');
          else if (L.n > 1 && el.closest('.ctabar, .sh-f, .p-acts')) add('the bottom action wraps to ' + L.n + ' lines');
          else if (L.n > 2) add('wraps to ' + L.n + ' lines');
        }
      }
    }
  }
  return out;
}

function pass(width, lng) {
  const tag = width + '-' + lng; const ru = lng === 'ru';
  const step = async (t, name, bag) => {
    await t.wait(700);
    const found = await t.page.evaluate(`(() => { const COUPLE_RE = ${COUPLE}; return (${audit})(); })()`);
    await t.shot('fit-' + tag + '-' + name);
    const bad = found.filter(x => x.strict);
    for (const x of found) console.log('   ' + (x.strict ? '✗' : '·') + ' ' + name + ' ' + x.kind + ' «' + x.text + '»' + (x.why ? ' — ' + x.why : x.text));
    bag.push(...bad.map(x => name + ': ' + x.kind + ' «' + x.text + '» — ' + (x.why || x.text)));
  };
  const close = async t => { await t.page.keyboard.press('Escape'); await t.wait(500); };
  const done = bag => expect(!bag.length, bag.length + ' fit problems:\n' + bag.join('\n'));
  const base = async t => { const couple = await coupleOf(t); expect(couple, 'the pair has an active couple'); await actAs(t, couple.id); if (!ru) await lang(t, 'en'); return couple; };
  const vp = { width, height: 780 };
  return [
   { name: `fit ${tag}: profile — actions, follow toast, ⋯ menu, report, block, private part`, persona: 'pair', viewport: vp, run: async t => {
     const couple = await base(t); const mate = await t.persona('mate'); const bag = [];
     const follows = async () => ((await t.api('profile.followers', { profileId: couple.id, following: true }, undefined, couple.id)).items ?? []).some(x => x.id === mate.personId);
     const was = await follows();
     try {
       await t.go('/n/people/' + mate.personId); await t.see('.p-acts .btn'); await step(t, 'profile', bag);
       await t.tap('.p-acts .btn[aria-pressed]'); await t.page.locator('.toast').first().waitFor({ state: 'visible', timeout: 30000 });
       await step(t, 'profile-follow-toast', bag);
       await t.wait(4500); await step(t, 'profile-following', bag);
       await t.tap('.p-acts .btn[aria-pressed]'); await t.wait(1500);
       const vault = t.page.locator('.vault').first();
       if (await vault.count()) { await vault.scrollIntoViewIfNeeded(); await step(t, 'profile-vault', bag);
         const ask = t.page.locator('.vault .btn', { hasText: ru ? 'Попросить доступ от пары' : 'Ask for access as the couple' }).first();
         if (await ask.count()) { await ask.click(); await t.see(sheet); await step(t, 'profile-ask-sheet', bag); await close(t); } }
       await t.page.evaluate(() => scrollTo(0, 0));
       await t.tap(ru ? '[aria-label="Ещё"]' : '[aria-label="More"]'); await t.see(sheet); await step(t, 'profile-menu', bag);
       await t.tap(sheet + ' .li:has-text("' + (ru ? 'Пожаловаться' : 'Report') + '")'); await t.see(sheet); await step(t, 'profile-report', bag); await close(t);
       await t.tap(ru ? '[aria-label="Ещё"]' : '[aria-label="More"]'); await t.tap(sheet + ' .li:has-text("' + (ru ? 'Заблокировать' : 'Block') + '")'); await t.see(sheet); await step(t, 'profile-block', bag); await close(t);
       await t.go('/n/people/' + mate.personId + '/follows'); await t.wait(1800); await step(t, 'profile-follows', bag);
       await t.go('/n/people/' + mate.personId + '/link'); await t.see('.ctabar .btn'); await step(t, 'link', bag);
     } finally { if ((await follows()) !== was) await t.api('follow.set', { opId: t.uuid7(), profileId: mate.personId, on: was }, undefined, couple.id); }
     done(bag);
   } },
   { name: `fit ${tag}: feed — composer, post, post menu, report`, persona: 'pair', viewport: vp, run: async t => {
     const couple = await base(t); const bag = [];
     await t.go('/n/feed'); await t.see('.composer'); await step(t, 'feed', bag);
     const post = ((await t.api('feed.list', { tab: 'forYou', limit: 10 }, undefined, couple.id)).items ?? []).find(x => x.id && x.type && x.rev == null);
     expect(post, 'the couple sees a post');
     await t.go('/n/feed/post/' + post.id); await t.see('.post-a'); await step(t, 'post', bag);
     const more = t.page.locator('.post [aria-label="Ещё"], .post [aria-label="More"], [aria-label="Действия с публикацией"], [aria-label="Post actions"]').first();
     if (await more.count()) { await more.click(); await t.see(sheet); await step(t, 'post-menu', bag);
       const rep = t.page.locator(sheet + ' .li', { hasText: ru ? 'Пожаловаться' : 'Report' }).first();
       if (await rep.count()) { await rep.click(); await t.see(sheet); await step(t, 'post-report', bag); }
       await close(t); }
     await t.go('/n/feed/new'); await t.see('.ctabar .btn'); await step(t, 'compose', bag);
     done(bag);
   } },
   { name: `fit ${tag}: events and communities — RSVP and toast, tickets, application, join sheets`, persona: 'pair', viewport: vp, run: async t => {
     const couple = await base(t); const host = await t.persona('host'); const bag = [];
     const get = async () => (await t.api('event.get', { eventId: host.eventId }, undefined, couple.id)).event;
     const had = (await get()).me.rsvp?.status ?? null;
     try {
       await t.go('/n/events/' + host.eventId); await t.see('.rsvp'); await t.page.locator('.rsvp').first().scrollIntoViewIfNeeded(); await step(t, 'event', bag);
       if (!had) { await t.tap('.rsvp .r-interested'); await t.page.locator('.toast').first().waitFor({ state: 'visible', timeout: 30000 }); await step(t, 'event-rsvp-toast', bag); }
     } finally { if (((await get()).me.rsvp?.status ?? null) !== had && !had) await t.api('event.rsvp', { opId: t.uuid7(), eventId: host.eventId, status: null }, undefined, couple.id); }
     await t.go('/n/events/' + host.ticketEventId); await t.wait(1500); await step(t, 'event-tickets', bag);
     const tk = t.page.locator('.btn', { hasText: ru ? /Билет/ : /ticket/i }).first();
     if (await tk.count()) { await tk.click(); await t.wait(800); if (await t.page.locator(sheet).count()) { await step(t, 'event-tickets-sheet', bag); await close(t); } }
     await t.go('/n/events/' + host.appEventId); await t.wait(1500); await step(t, 'event-app', bag);
     await t.go('/n/events/' + host.appEventId + '/apply'); await t.wait(1500); await step(t, 'event-apply', bag);
     for (const [k, id] of [['open', host.openId], ['closed', host.closedId], ['closedNoQ', host.closedNoQId]]) {
       await t.go('/n/communities/' + id); await t.wait(1500); await step(t, 'community-' + k, bag);
       const join = t.page.locator('.btn', { hasText: ru ? /от пары/ : /as (the couple|us)/ }).first();
       if (await join.count()) { await join.click(); await t.wait(800); if (await t.page.locator(sheet).count()) { await step(t, 'community-' + k + '-join', bag); await close(t); } }
     }
     done(bag);
   } },
   { name: `fit ${tag}: Me — profile, edit, interests, links, access, likes, inbox`, persona: 'pair', viewport: vp, run: async t => {
     await base(t); const bag = [];
     for (const [n, r] of [['me', '/n/me'], ['me-edit', '/n/me/edit'], ['me-interests', '/n/me/interests'], ['me-links', '/n/me/links'], ['me-access', '/n/me/access'], ['me-shared', '/n/me/shared'], ['people', '/n/people'], ['inbox', '/n/inbox'], ['me-pair', '/n/me/pair'], ['me-follows', '/n/me/follows']]) {
       await t.go(r); await t.wait(1800); await step(t, n, bag);
     }
     done(bag);
   } },
   { name: `fit ${tag}: the partner approves — «На согласие партнёру» everywhere it shows`, persona: 'pair', viewport: vp, run: async t => {
     const couple = await base(t); const host = await t.persona('host'); const bag = [];
     const partner = t.me.partner;
     const before = (await t.api('couple.get', {}, undefined, couple.id)).couple.members.find(m => !m.me)?.approvesPartner;
     try {
       if (!before) expect((await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: true }, partner.email, couple.id)).ok, 'the partner could not switch approval on');
       await t.go('/n/me/edit'); await t.see('.ctabar .btn'); await step(t, 'ap-me-edit', bag);
       await t.go('/n/feed/new'); await t.see('.ctabar .btn'); await step(t, 'ap-compose', bag);
       await t.go('/n/events/' + host.appEventId + '/apply'); await t.wait(1500); await step(t, 'ap-event-apply', bag);
       for (const [k, id] of [['open', host.openId], ['closed', host.closedId]]) {
         const c = (await t.api('community.get', { communityId: id }, undefined, couple.id)).community;
         if (c?.me?.member || c?.joined) continue;
         await t.go('/n/communities/' + id);
         const join = t.page.locator('.btn', { hasText: ru ? /от пары/ : /as (the couple|us)/ }).first();
         await join.waitFor({ state: 'visible', timeout: 30000 }); await join.click(); await t.see(sheet); await step(t, 'ap-community-' + k + '-join', bag); await close(t);
       }
       await t.go('/n/me/interests'); await t.wait(1500); await step(t, 'ap-interests', bag);
       const topic = t.page.locator('.li', { hasText: /./ }).first();
       if (await topic.count()) { await topic.click(); await t.wait(800); if (await t.page.locator(sheet).count()) { await step(t, 'ap-interest-sheet', bag); await close(t); } }
     } finally {
       if (!before) await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: false }, partner.email, couple.id);
     }
     done(bag);
   } },
  ];
}


/** The app's copy (src/fe/i18n/*.ts, `ru` then `en` object of each file), for the probes below. */
function copy(lng) {
  const dir = new URL('../../../src/fe/i18n/', import.meta.url).pathname; const out = {};
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.ts'))) {
    const src = fs.readFileSync(dir + f, 'utf8'); const at = src.search(/^export const en\b/m); if (at < 0) continue;
    const part = lng === 'en' ? src.slice(at) : src.slice(0, at);
    for (const m of part.matchAll(/['"](fe\.[\w.]+)['"]\s*:\s*(['"])((?:\\.|(?!\2).)*)\2/g)) out[m[1]] ??= m[3].replace(/\\(.)/g, '$1');
  }
  const main = fs.readFileSync(dir + '../../i18n/' + lng + '.ts', 'utf8'); // the app's main dictionary
  for (const m of main.matchAll(/['"](fe\.[\w.]+)['"]\s*:\s*(['"])((?:\\.|(?!\2).)*)\2/g)) out[m[1]] ??= m[3].replace(/\\(.)/g, '$1');
  return out;
}

/** Cards that need another person's request, link or decision to appear (link proposals, access requests, inbox
 * decisions, a pending join request) are probed with the kit's own markup and the app's copy, on a real screen. */
function probes(width, lng) {
  const tag = width + '-' + lng; const ru = lng === 'ru';
  return [{ name: `fit ${tag}: probes — request cards, status card, sheet feet, dialog, toasts with couple copy`, persona: 'pair', viewport: { width, height: 780 }, run: async t => {
    const couple = await coupleOf(t); await actAs(t, couple.id); if (!ru) await lang(t, 'en');
    const c = copy(lng); const k = key => { expect(c[key], 'no copy for ' + key); return c[key]; };
    const bag = [];
    const run = async name => {
      await t.wait(400);
      const found = await t.page.evaluate(`(() => { const COUPLE_RE = ${COUPLE}; return (${audit})(); })()`);
      await t.shot('fit-' + tag + '-' + name);
      for (const x of found) console.log('   ' + (x.strict ? '✗' : '·') + ' ' + name + ' ' + x.kind + ' «' + x.text + '»' + (x.why ? ' — ' + x.why : ''));
      bag.push(...found.filter(x => x.strict).map(x => name + ': ' + x.kind + ' «' + x.text + '» — ' + x.why));
    };
    const mate = await t.persona('mate');
    await t.go('/n/people/' + mate.personId); await t.see('.p-acts .btn');
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const rq = (a, b) => `<div class="card rqcard"><div class="row"><span class="av"></span><div class="grow"><b>Алекс, 34</b><div class="note">${esc(k('fe.ln.proposesCouple').replace('{label}', ru ? 'друзья' : 'friends'))}</div></div></div><div class="row g8 mt12"><button type="button" class="btn primary md">${esc(a)}</button><button type="button" class="btn soft md">${esc(b)}</button></div></div>`;
    const status = (title, sub, act) => `<div class="card list k-status k-status-wait"><div class="li k-li-static"><span class="ico"></span><span class="tx"><b>${esc(title)}</b><small>${esc(sub)}</small></span><button type="button" class="btn soft sm auto k-fit">${esc(act)}</button></div></div>`;
    const html = [rq(k('fe.ln.confirm'), k('fe.ln.decline')), rq(k('fe.priv.grant'), k('fe.priv.decline')), rq(k('fe.ibx.approve'), k('fe.ibx.decline')), rq(k('fe.ibx.review'), k('fe.ibx.decline')),
      status(k('fe.host.join.pendingUs'), k('fe.cm.req.next'), k('fe.host.join.withdraw')), status(k('fe.host.app.st.pendingUs'), k('fe.host.app.stText.pending'), k('fe.host.join.withdraw')),
      // «Подписчики / Подписки» rows (browse): the couple's follow button at the end of a row with a long name.
      `<div class="card list">${[['primary', k('fe.br.followUs')], ['soft', k('fe.br.unfollowUs')]].map(([kd, l]) => `<div class="li k-li-end frow"><button type="button" class="k-li-main"><span class="av"></span><span class="tx"><b><span class="fnm">${ru ? 'Александра Константинопольская' : 'Alexandra Constantinople'}</span></b><small>@alexandra_k</small></span></button><button type="button" class="btn ${kd} sm">${esc(l)}</button></div>`).join('')}</div>`].join('');
    await t.page.evaluate(h => { const at = document.querySelector('.p-acts'); const box = document.createElement('div'); box.id = 'fit-probe'; box.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr);gap:12px;min-width:0;max-width:100%;grid-column:1/-1'; box.innerHTML = h; at.after(box); box.scrollIntoView(); }, html);
    await run('probe-cards');
    await t.page.evaluate(() => document.getElementById('fit-probe')?.remove());
    // Sheet feet: the report sheet with the couple's buttons the app puts in sheet feet.
    await t.tap(ru ? '[aria-label="Ещё"]' : '[aria-label="More"]'); await t.tap(sheet + ' .li:has-text("' + (ru ? 'Пожаловаться' : 'Report') + '")'); await t.see(sheet + ' .sh-f');
    const foot = `<div class="row g8"><button type="button" class="btn soft k-fit">${esc(k('fe.back'))}</button><button type="button" class="btn primary">${esc(k('fe.ca.toPartner'))}</button></div>`
      + ['fe.ca.toPartner', 'fe.host.join.sendCouple', 'fe.host.app.sendCouple', 'fe.ac.rq.sendUs', 'fe.ca.reportSend', 'fe.me.saveToPartner'].map(x => `<button type="button" class="btn primary">${esc(k(x))}</button>`).join('')
      + `<button type="button" class="btn danger">${esc(k('fe.ca.block'))}</button>`;
    await t.page.evaluate(h => { const f = document.querySelector('.sheet.on .sh-f'); f.insertAdjacentHTML('afterbegin', h); }, foot);
    await run('probe-sheet-foot');
    // A dialog with the couple's answer (leave the community, revoke access).
    await t.page.evaluate(h => { const s = document.querySelector('.sheet.on'); s.insertAdjacentHTML('afterend', h); }, `<div class="dialog on" role="alertdialog" style="display:block;z-index:4"><div class="ico a"></div><h2>${esc(k('fe.cm.leaveQUs').replace('{name}', ru ? 'Свободные пары Берлина' : 'Berlin open couples'))}</h2><p>${esc(k('fe.cm.leaveTextClosed'))}</p><div class="btns"><button type="button" class="btn danger">${esc(k('fe.cm.leaveUs'))}</button><button type="button" class="btn soft">${esc(k('fe.ac.rv.okUs'))}</button><button type="button" class="btn soft">${esc(k('fe.cancel'))}</button></div></div>`);
    await run('probe-dialog');
    await t.page.keyboard.press('Escape'); await t.wait(500);
    await t.page.evaluate(() => document.querySelectorAll('.dialog.on').forEach(d => d.remove()));
    // Toasts: the longest couple toasts with «Отменить».
    const name = ru ? 'Александра Константинопольская' : 'Alexandra Constantinople';
    const toasts = ['fe.ca.waitPartner', 'fe.ca.reported', 'fe.px.lkd.sentUs', 'fe.ac.dec.doneUs', 'fe.w7.tk.markedUs', 'fe.pm.done.authorHiddenNameUs'].map(x => k(x).replace('{name}', name).replace('{d}', '30').replace('{left}', '9').replace('{max}', '10'));
    await t.page.evaluate(([list, undo]) => { const box = document.getElementById('toasts'); for (const m of list) box.insertAdjacentHTML('beforeend', `<div class="toast ok" role="status"><svg width="20" height="20"></svg><span class="tx">${m}</span><button type="button" class="tb">${undo}</button></div>`); }, [toasts, k('fe.mx.undo')]);
    await run('probe-toasts');
    done(bag);
  } }];
}
const done = bag => expect(!bag.length, bag.length + ' fit problems:\n' + bag.join('\n'));

export default [...pass(360, 'ru'), ...probes(360, 'ru'), ...pass(390, 'ru'), ...probes(390, 'ru'), ...pass(360, 'en'), ...probes(360, 'en')];
