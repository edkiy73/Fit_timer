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
