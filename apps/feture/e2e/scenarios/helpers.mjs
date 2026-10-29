export const expect = (c, msg) => { if (!c) throw new Error(msg); };
/** Polls a read-back through the API until it holds (the UI write may still be in flight when an older toast shows). */
export async function until(fn, msg, ms = 20000) { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 1000)); } throw new Error(msg); }
/** The bottom action is present, inside the viewport and not covered (by the dock or anything else). */
export async function pinned(t, text) {
  const b = t.page.locator(`.ctabar button:has-text("${text}"), .sh-f button:has-text("${text}")`).first();
  await b.waitFor({ state: 'visible', timeout: 30000 });
  const ok = await b.evaluate(el => { const r = el.getBoundingClientRect(); if (r.bottom > innerHeight || r.top < 0) return 'outside ' + r.top + '-' + r.bottom; const x = r.left + r.width / 2, y = r.top + r.height / 2; const h = document.elementFromPoint(x, y); return h && (h === el || el.contains(h) || (h.contains(el) && h.closest('.ctabar,.sh-f') === el.closest('.ctabar,.sh-f'))) ? true : 'covered by ' + (h?.className || h?.tagName); });
  if (ok !== true) throw new Error(`«${text}» not usable: ${ok}`);
}
export async function toastSee(t, text, timeout = 30000) { await t.page.locator('.toast', { hasText: text }).first().waitFor({ state: 'visible', timeout }); }
/** A 640×640 PNG made from a screenshot of a colour block (own context: the test context's init script needs a real origin). */
export async function pngOf(t) {
  const ctx = await t.page.context().browser().newContext({ viewport: { width: 640, height: 640 } });
  const p = await ctx.newPage();
  await p.setContent(`<body style="margin:0;background:linear-gradient(135deg,#c33,#36c)"><h1 style="color:#fff;font:700 64px sans-serif;padding:80px">e2e ${Date.now() % 1000}</h1></body>`);
  const buf = await p.screenshot({ type: 'png' }); await ctx.close(); return buf;
}
/** Native <select> inside SelectRow, by its label. */
export async function pick(t, label, optionText) {
  const s = t.page.locator(`select[aria-label="${label}"]`).first();
  await s.selectOption({ label: optionText }); await t.wait(600);
}
// ── Shared across areas ───────────────────────────────────────────────────────────────────────────────────────────
export const stamp = () => Math.random().toString(36).slice(2, 8);
export const FIXTURES = new URL('../fixtures/', import.meta.url).pathname;
export const sheet = '.sheet.on', dialog = '.dialog.on';
export const toast = (t, s) => t.see('.toast:has-text("' + s + '")');
/** No sheet or dialog left open. */
/** The composer row is ONE button (owner 29.10.2026): tap a spot of it — `part` 'field', 'media', 'poll' or 'add', or
 * the row itself — with a real mouse click there (the icons are not buttons) and wait for the «Создать» sheet. */
export async function composerSheet(t, part = 'field', scope = '') {
  const row = t.page.locator(`${scope} .composer`.trim()).first();
  const sel = { field: '.cmp-main', media: '.ibtn.ghost >> nth=0', poll: '.ibtn.ghost >> nth=1', add: '.ibtn.add' }[part];
  const b = await (sel ? row.locator(sel) : row).first().boundingBox();
  await t.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await t.see('.sheet.on:has-text("Создать")'); await t.see('.sheet.on .create-q');
}
export async function noLayer(t) { await t.wait(400); if (await t.page.locator('.sheet.on, .dialog.on').count()) throw new Error('layer still open'); }
/** The display name of a persona (falls back to the nickname). */
export async function nameOf(t, p) { const pr = (await t.api('profile.get', { profileId: p.personId }, p.email)).profile; return pr?.name || p.handle; }
/** A full person of the lane asks `ownerId` for the private part; an open request is reused. Askers have 10 requests
 * a day: when `asker` has used them up, `asker2`, `asker3` take over (built on first use). Returns the asker with
 * `id` (profile), `name` and `requestId`; `cancelAsk(t, a)` takes the request back. */
export async function askAccess(t, ownerId) {
  for (const kind of ['asker', 'asker2', 'asker3']) {
    const a = await t.persona(kind);
    const r = await t.api('access.request', { opId: t.uuid7(), profileId: ownerId, scopes: ['info'] }, a.email);
    if (r.status === 429) continue;
    if (!r.id && r.rule !== 'pending') throw new Error('access.request: ' + JSON.stringify(r).slice(0, 300));
    const requestId = r.id ?? (await t.api('access.lists', { tab: 'out' }, a.email)).items?.find(x => x.profile?.id === ownerId && x.state === 'pending')?.id;
    return { ...a, id: a.personId, name: await nameOf(t, a), requestId };
  }
  throw new Error('every asker has used up today\'s requests');
}
export async function cancelAsk(t, a) { if (a?.requestId) await t.api('access.cancel', { opId: t.uuid7(), requestId: a.requestId }, a.email); }
/** Out of a community (as `as`): leaves it, withdraws a pending request. */
export async function outOf(t, communityId, as) {
  const c = (await t.api('community.get', { communityId }, as)).community;
  if (c?.me?.state === 'active' && c.me.role !== 'owner') await t.api('community.leave', { opId: t.uuid7(), communityId }, as);
  if (c?.request) await t.api('community.requestWithdraw', { opId: t.uuid7(), requestId: c.request.id }, as);
}
/** `as` has a pending join request to the community (leaving first if a member). */
export async function joinRequest(t, communityId, as) {
  const c = (await t.api('community.get', { communityId }, as)).community;
  if (c?.request) return c.request.id;
  if (c?.me?.state === 'active') await t.api('community.leave', { opId: t.uuid7(), communityId }, as);
  const r = await t.api('community.join', { opId: t.uuid7(), communityId, rulesAccepted: true, answer: 'Хочу участвовать в разговорах и встречах, правила прочитаны.' }, as);
  if (r.status >= 400) throw new Error('community.join ' + JSON.stringify(r).slice(0, 200));
  return r.requestId ?? r.id;
}
/** The kit uploader sheet after a file pick: the row is checked, «Готово» closes it. */
export async function uploaderDone(t) {
  await t.see('.sheet.on .k-uprow:has-text("без геометки")', 20000);
  await t.tap('.sheet.on .sh-f button:has-text("Готово")');
  await t.page.locator('.sheet.on .k-uprow').first().waitFor({ state: 'detached', timeout: 60000 });
}
/** For scenarios on a fresh `new` persona: whatever account it registered is deleted afterwards (reruns start clean). */
export const dropsNew = list => list.map(sc => sc.persona !== 'new' ? sc : ({ ...sc, run: async t => {
  try { await sc.run(t); } finally {
    const p = (await t.boot()).profiles?.find(x => x.kind === 'person' && x.state !== 'deleted');
    if (p?.handle) await t.api('account.delete', { opId: t.uuid7(), confirmHandle: p.handle });
  }
} }));

/** A source clip recorded in the page (MediaRecorder from a canvas full of noise + a tone, so it is big and has sound):
 * `w`×`h`, `seconds` long, at a high bitrate — what a phone camera hands over. Returns {name, mimeType, buffer, size}. */
export async function sourceClip(t, { w = 1280, h = 720, seconds = 4, bitrate = 8e6, noise = true } = {}) {
  const b64 = await t.page.evaluate(async ({ w, h, seconds, bitrate, noise }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const ac = new AudioContext(); const osc = ac.createOscillator(); const dst = ac.createMediaStreamDestination(); osc.connect(dst); osc.start();
    const st = c.captureStream(30); dst.stream.getAudioTracks().forEach(tr => st.addTrack(tr));
    const rec = new MediaRecorder(st, { mimeType: 'video/webm', videoBitsPerSecond: bitrate }); const parts = [];
    rec.ondataavailable = e => parts.push(e.data);
    let f = 0; const draw = () => {
      if (noise) { const im = g.createImageData(w, h); const d = im.data; for (let i = 0; i < d.length; i += 4) { const v = (Math.random() * 255) | 0; d[i] = v; d[i + 1] = (f * 7) & 255; d[i + 2] = 255 - v; d[i + 3] = 255; } g.putImageData(im, 0, 0); }
      else { g.fillStyle = `hsl(${f * 9},70%,50%)`; g.fillRect(0, 0, w, h); }
      g.fillStyle = '#fff'; g.font = `700 ${Math.round(h / 8)}px sans-serif`; g.fillText('e2e ' + f++, w / 20, h / 6);
    };
    const iv = setInterval(draw, 33); draw();
    rec.start(500); await new Promise(r => setTimeout(r, seconds * 1000 + 150)); rec.stop(); clearInterval(iv); await new Promise(r => { rec.onstop = r; }); osc.stop(); void ac.close();
    const buf = new Uint8Array(await new Blob(parts, { type: 'video/webm' }).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s);
  }, { w, h, seconds, bitrate, noise });
  const buffer = Buffer.from(b64, 'base64');
  return { name: 'source.webm', mimeType: 'video/webm', buffer, size: buffer.length };
}
/** Records what the uploader sends for a clip: the upload intent (bytes, durationMs, mime) and the uploaded file's
 * container (MP4 with H.264 + AAC, or WebM with Opus). */
export function watchVideoUpload(t) {
  const got = { intent: null, put: null };
  t.page.on('request', r => {
    try {
      if (r.method() === 'POST' && r.url().includes('/api/fe')) { const b = JSON.parse(r.postData() || '{}'); if (b.action === 'media.uploadIntent' && b.kind === 'video') got.intent = b; }
      if (r.method() === 'PUT' && !/\.poster/.test(r.url())) {
        const buf = r.postDataBuffer(); if (!buf || buf.length < 1000) return;
        const head = buf.toString('latin1');
        got.put = { size: buf.length, mp4: head.slice(4, 8) === 'ftyp', avc: head.includes('avc1'), aac: head.includes('mp4a'), webm: head.startsWith('\x1a\x45\xdf\xa3'), opus: head.includes('A_OPUS') || head.includes('Opus') };
      }
    } catch { /* not ours */ }
  });
  return got;
}

/** A finger drag down from (x, from) to (x, to) as real touch events (needs `touch: true`); `mid` runs before the
 * finger lifts (a screenshot of the pull). */
export async function pullDown(t, { x = 195, from = 300, to = 560, steps = 16, mid } = {}) {
  const c = await t.page.context().newCDPSession(t.page);
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] });
  for (let i = 1; i <= steps; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from + (to - from) * i / steps }] }); await t.wait(16); }
  if (mid) await mid();
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await c.detach();
}

// Status bar over the top of an edge-to-edge phone (owner 29.10.2026): the open full-height sheet's header must start
// below the inset — the title is never drawn under the system bar and sits as low as a page title (the kit Bar).
export async function sheetBelowStatusBar(t, inset = 28) {
  await t.page.evaluate(px => document.querySelectorAll('html, .v21').forEach(e => e.style.setProperty('--safe-area-inset-top', px + 'px')), inset);
  await t.wait(200);
  const r = await t.page.evaluate(() => { const h = document.querySelector('.sheet.on .sh-h'), x = h?.querySelector('h2'); if (!h || !x) return null; const a = h.getBoundingClientRect(), b = x.getBoundingClientRect(); return { head: a.top, headH: a.height, title: b.top, titleBottom: b.bottom }; });
  expect(r, 'no open sheet header');
  expect(r.title >= inset, `sheet title above the status bar: top ${r.title} < ${inset}`);
  expect(r.headH >= 56 + inset - 1, `sheet header shorter than a page title bar: ${r.headH} < ${56 + inset}`);
  return r;
}

/** Leave guard (kit `useLeaveGuard`): with something typed, leaving by the screen's own back, by Browser Back and by a dock tab
 * asks first; «Остаться» keeps the input and the place, «Не сохранять» / «Выйти» leaves. `typed()` puts the input in and
 * `kept()` says whether it is still there. `via` is `back`, `browser` or `tab`. */
export async function leaveGuard(t, { typed, kept, via, leave = 'danger', url }) {
  const ask = '.dialog.on';
  await typed();
  if (via === 'back') await t.tap('.bar .ibtn >> nth=0');
  else if (via === 'browser') await t.page.goBack();
  else await t.tap('nav.dock a, nav.dock button >> nth=0');
  await t.see(ask, 5000);
  await t.tap(`${ask} .btn:has-text("Остаться")`); await t.notSee(ask, 2000);
  expect(await kept(), 'input kept after «Остаться» (' + via + ')');
  if (url) expect(t.page.url().includes(url), 'still on ' + url + ': ' + t.page.url());
  if (via === 'back') await t.tap('.bar .ibtn >> nth=0');
  else if (via === 'browser') await t.page.goBack();
  else await t.tap('nav.dock a, nav.dock button >> nth=0');
  await t.see(ask, 5000);
  await t.tap(`${ask} .btn.${leave}`); await t.wait(800);
  if (url) expect(!t.page.url().includes(url), 'left ' + url + ': ' + t.page.url());
}
