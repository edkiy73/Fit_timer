// Wave 4 «Приватное и доступы» with two people of one lane: A (persona `pa`) asks, B (persona `pb`) owns a private part
// with a description and an approved photo. Each step taps through the screens and reads the result back via the API.
//   request sheet (parts as chips with «Всё», «Сегодня можно ещё N») → «Запрос уже отправлен» → «Мои запросы» (filter) → B declines, the
//   toast's «Отменить» undoes it → B opens a part that was not asked for → A sees the photo with their own watermark
//   → B narrows («Изменить») → B revokes after the question → A asks again and cancels («попытка не возвращается»).
// Uses 2 of A's 10 daily requests per run. A decline is always undone, so no 30-day cooldown is left behind.
import { expect, until, toastSee } from './helpers.mjs';
import { persona, STAFF, staff } from '../personas.mjs';
import { uploadFixture } from '../lib.mjs';

const LANE = process.env.E2E_LANE || 'w4';
const people = async () => ({ a: await persona(LANE, 'pa'), b: await persona(LANE, 'pb') });
const outFor = async (t, a, b) => (await t.api('access.lists', { tab: 'out' }, a.email)).items?.find(x => x.profile?.id === b.personId);
const incomingFrom = async (t, a, b) => (await t.api('access.lists', { tab: 'incoming' }, b.email)).items?.find(x => x.profile?.id === a.personId);
const grantTo = async (t, a, b) => (await t.api('access.lists', { tab: 'byme' }, b.email)).items?.find(x => x.profile?.id === a.personId);
const quota = async (t, a) => t.api('access.quota', {}, a.email);

/** B has a private part (on, everyone may ask, a description and an approved photo); A and B start with nothing between them. */
async function setup(t) {
  const { a, b } = await people();
  const ok = (r, what) => { if (r.status && r.status >= 400) throw new Error(what + ': ' + JSON.stringify(r).slice(0, 300)); return r; };
  ok(await t.api('private.setOn', { opId: t.uuid7(), on: true }, b.email), 'private on');
  ok(await t.api('profile.setVisibility', { opId: t.uuid7(), setting: 'requestsFrom', value: 'all' }, b.email), 'requestsFrom');
  ok(await t.api('private.setText', { opId: t.uuid7(), text: 'e2e: приватное описание для тех, кому открыто' }, b.email), 'private text');
  const mine = await t.api('private.get', { profileId: b.personId }, b.email);
  if (!(mine.media ?? []).some(m => m.kind === 'image' && !m.pending)) {
    const asset = await uploadFixture(b.email, 'private');
    ok(await t.api('private.setMedia', { opId: t.uuid7(), assetIds: [asset] }, b.email), 'private media');
    await staff();
    let done = false;
    for (let i = 0; i < 20 && !done; i++) { // the scan job runs first
      const r = await t.api('staff.mediaDecide', { opId: t.uuid7(), assetId: asset, decision: 'approve', explicit: false }, STAFF);
      done = r.status === 200; if (!done) await t.wait(3000);
    }
    expect(done, 'private photo approval did not go through');
  }
  // A clean slate: nothing waiting from A to B, nothing open from B to A.
  const out = (await t.api('access.lists', { tab: 'out', filter: 'pending' }, a.email)).items ?? [];
  for (const r of out.filter(x => x.profile?.id === b.personId)) await t.api('access.cancel', { opId: t.uuid7(), requestId: r.id }, a.email);
  await t.api('access.revoke', { opId: t.uuid7(), profileId: a.personId }, b.email);
  const last = await outFor(t, a, b);
  expect(!(last?.state === 'declined' && last.reaskAt && new Date(last.reaskAt) > new Date()), 'A is in the 30-day cooldown for B — a previous run left a decline');
  const p = await t.api('private.get', { profileId: b.personId }, a.email);
  expect(p.canRequest === true, 'A cannot ask B: ' + JSON.stringify({ reason: p.reason, available: p.available }));
  return { a, b };
}

export default [
 { name: 'A asks for the description: chips with «Всё» and «Сегодня можно ещё N», then «Запрос уже отправлен» → «Мои запросы»', persona: 'pa', allow4xx: true, run: async t => {
   const { a, b } = await setup(t);
   const before = await quota(t, a);
   expect(before.left > 0, 'A has no requests left today (resets ' + before.resetsAt + ')');
   await t.go('/n/people/' + b.personId);
   await t.tap('#priv button:has-text("Попросить доступ")');
   await t.see('.sheet.on h2:has-text("Запросить приватную часть")');
   await t.see(`.sheet.on .note:has-text("Сегодня можно ещё ${before.left}")`);
   expect(!(await t.page.locator('.sheet.on .quota').count()), 'no segment bar');
   // Every part the private part has is a chip, all picked at first; «Всё» clears them, then «Описание» alone.
   const chip = l => t.page.locator('.sheet.on .chips button.chip', { hasText: l });
   expect(await chip('Всё').getAttribute('aria-pressed') === 'true', '«Всё» picked at first');
   await t.see('.sheet.on .chips button.chip:has-text("Фото")'); await t.shot('w4-request-sheet');
   await chip('Всё').click();
   expect(await t.page.locator('.sheet.on .chips button.chip[aria-pressed="true"]').count() === 0, '«Всё» again clears the choice');
   expect(await t.page.locator('.sheet.on .sh-f button:has-text("Отправить запрос")').isDisabled(), 'nothing picked: send is off');
   await chip('Описание').click();
   await t.tap('.sheet.on .sh-f button:has-text("Отправить запрос")');
   await toastSee(t, 'Запрос отправлен');
   const r = await until(async () => { const x = await outFor(t, a, b); return x?.state === 'pending' && x; }, 'request is pending on the server');
   expect(JSON.stringify(r.scopes) === '["info"]', 'asked only for info: ' + JSON.stringify(r.scopes));
   const after = await quota(t, a);
   expect(after.left === before.left - 1, `quota ${before.left} → ${after.left}`);
   // Pressing again opens «Запрос уже отправлен», which leads to the centre.
   await t.tap('#priv button:has-text("Запрос отправлен")');
   await t.see('.sheet.on h2:has-text("Запрос уже отправлен")');
   await t.see('.sheet.on .li:has-text("Описание")');
   await t.tap('.sheet.on .sh-f button:has-text("Все мои запросы")');
   await t.see('.seg [aria-selected="true"]:has-text("Мои запросы")');
   await t.see(`text=Сегодня осталось ${after.left} из ${after.max}`);
   await t.tap('button.chip:has-text("Ждут ответа")');
   await t.see('.li:has-text("ждёт ответа")'); await t.shot('w4-my-requests');
   expect(t.page.url().includes('f=pending'), 'filter kept in the address');
 } },
 { name: 'B declines with an explanation, «Отменить» in the toast brings the request back, then opens a part that was not asked for', persona: 'pb', allow4xx: true, run: async t => {
   const { a, b } = await people();
   expect(await incomingFrom(t, a, b), 'B has the request from A');
   await t.go('/n/me/access?tab=byme');
   const card = t.page.locator('.rqcard', { hasText: 'qa_w4_pa' }).first();
   await card.waitFor({ timeout: 30000 });
   await card.locator('button:has-text("Отказать")').click();
   await toastSee(t, 'решили не открывать');
   // While the undo window is open the requester still sees «ждёт ответа».
   expect((await outFor(t, a, b))?.state === 'pending', 'held decline reads as waiting for A');
   expect(!(await incomingFrom(t, a, b)), 'declined: gone from B\'s incoming');
   await t.page.locator('.toast button:has-text("Отменить")').click();
   await toastSee(t, 'Отказ отменён');
   await until(() => incomingFrom(t, a, b), 'undo: the request waits for B again');
   // Grant: «Фото» was not asked for — it is marked, B ticks it, 24 hours.
   await card.waitFor({ timeout: 30000 });
   await card.locator('button:has-text("Открыть доступ")').click();
   await t.see('.sheet.on [role="checkbox"]:has-text("не запрошено")');
   await t.tap('.sheet.on [role="checkbox"]:has-text("Фото")');
   await t.tap('.sheet.on button[role="radio"]:has-text("24 часа")');
   await t.see('.sheet.on .alert:has-text("Чат и симпатию это не открывает")'); await t.shot('w4-grant-sheet');
   await t.tap('.sheet.on .sh-f button:has-text("Открыть на 24 часа")');
   await toastSee(t, 'Открыто для');
   const g = await until(() => grantTo(t, a, b), 'grant to A on the server');
   expect(JSON.stringify(g.scopes) === '["info","photos"]', 'granted info+photos: ' + JSON.stringify(g.scopes));
   expect(g.until && new Date(g.until) - Date.now() < 25 * 3600e3, '24 h term: ' + g.until);
   expect((await outFor(t, a, b))?.state === 'granted', 'A sees «открыт»');
 } },
 { name: 'A sees the private photo with their own watermark; «Моё → Мне открыли» is the «Доступы» tab and lists B', persona: 'pa', run: async t => {
   const { a, b } = await people();
   const p = await t.api('private.get', { profileId: b.personId }, a.email);
   expect((p.media ?? []).every(m => m.watermark === '@' + a.handle), 'server watermark is A\'s handle: ' + JSON.stringify((p.media ?? []).map(m => m.watermark)));
   await t.go('/n/people/' + b.personId);
   await t.see('#priv.vault.open');
   await t.see('#priv:has-text("приватное описание")');
   await t.tap('#priv .gtile');
   await t.see(`.viewer .vw-wm span:has-text("@${a.handle}")`); await t.shot('w4-watermark');
   await t.page.keyboard.press('Escape');
   await t.go('/n/me/shared');
   await t.see('.seg [aria-selected="true"]:has-text("Мне открыли")');
   expect(t.page.url().includes('/n/me/access') && t.page.url().includes('tab=withme'), 'one screen: ' + t.page.url());
   await t.see(`.li:has-text("qa_w4_pb")`);
   await t.notSee('.li:has-text("Я → Приватное")', 500);
 } },
 { name: 'B narrows to the description («Изменить»), then revokes after «Отозвать доступ у …?»', persona: 'pb', run: async t => {
   const { a, b } = await people();
   await t.go('/n/me/access?tab=byme');
   const card = t.page.locator('.rqcard', { hasText: 'qa_w4_pa' }).first();
   await card.locator('button:has-text("Изменить")').click();
   await t.see('.sheet.on h2:has-text("Доступ для")');
   await t.tap('.sheet.on [role="checkbox"]:has-text("Фото")');
   await t.see('.sheet.on .alert:has-text("останется закрытым")'); await t.shot('w4-narrow-sheet');
   await t.tap('.sheet.on .sh-f button:has-text("Сохранить изменения")');
   await toastSee(t, 'Доступ изменён');
   await until(async () => JSON.stringify((await grantTo(t, a, b))?.scopes) === '["info"]', 'narrowed to info on the server');
   await card.locator('button:has-text("Отозвать")').click();
   await t.see('.dialog.on:has-text("Отозвать доступ у")');
   await t.tap('.dialog.on button:has-text("Отозвать")');
   await toastSee(t, 'Доступ отозван');
   await until(async () => !(await grantTo(t, a, b)), 'grant gone on the server');
   await until(async () => (await outFor(t, a, b))?.state === 'revoked', 'A sees «доступ отозван»');
   await t.see('text=Доступ пока никому не открыт');
 } },
 { name: 'A asks again and cancels from «Мои запросы»: «попытка не возвращается»', persona: 'pa', allow4xx: true, run: async t => {
   const { a, b } = await people();
   const r = await t.api('access.request', { opId: t.uuid7(), profileId: b.personId, scopes: ['info'] }, a.email);
   expect(r.state === 'pending', 'second request: ' + JSON.stringify(r).slice(0, 200));
   const left = (await quota(t, a)).left;
   await t.go('/n/me/access?tab=out');
   await t.see('.li:has-text("доступ отозван")');
   const row = t.page.locator('.li', { hasText: 'ждёт ответа' }).first();
   await row.locator('button:has-text("Отменить запрос")').click();
   await toastSee(t, 'Попытка не возвращается');
   await until(async () => (await t.api('access.lists', { tab: 'out' }, a.email)).items?.find(x => x.id === r.id)?.state === 'cancelled', 'cancelled on the server');
   expect((await quota(t, a)).left === left, 'the attempt is not refunded');
   await t.see('.li:has-text("отменён")'); await t.shot('w4-cancelled');
 } },
];
