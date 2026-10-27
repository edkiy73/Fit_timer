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
