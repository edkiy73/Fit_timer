// «Скоро» in «Лента · Для тебя» (V21 feedEvLess, FEED-014): upcoming events that concern the acting profile as compact
// tiles, «Скрыть» per event with «Вернуть» in the toast; a hidden event stays hidden after a reload (server feed_hide,
// kind 'event'). Read back through event.soon / feedHide.list. Needs the event.soon command on the API it runs against.
import { expect, until, toastSee } from '../helpers.mjs';

const soon = async (t, as) => (await t.api('event.soon', {}, as)).items ?? [];
const hiddenEvents = async t => ((await t.api('feedHide.list', {})).items ?? []).filter(x => x.kind === 'event').map(x => x.target_id);

/** An online event of the lane's host five days ahead (online events concern everyone), published by STAFF. */
async function hostOnline(t) {
  const host = await t.persona('host'); const staff = await t.persona('staff');
  const start = new Date(Date.now() + 5 * 864e5); start.setUTCHours(17, 0, 0, 0);
  const r = await t.api('event.submit', { opId: t.uuid7(), event: {
    title: 'QA скоро ' + (Date.now() % 100000), kind: 'talk', description: 'Онлайн-разговор для сценария «Скоро» в ленте, без записи.',
    format: 'online', joinUrl: 'https://meet.example.org/qa-soon', tz: 'Europe/Berlin',
    startsAt: start.toISOString(), endsAt: new Date(+start + 3600e3).toISOString(), price: { kind: 'free' }, plate: 'sea' } }, host.email);
  if (!r.id) throw new Error('event.submit: ' + JSON.stringify(r).slice(0, 200));
  const e = (await t.api('event.get', { eventId: r.id }, host.email)).event;
  const d = await t.api('staff.eventDecide', { opId: t.uuid7(), eventId: r.id, rev: e.rev, decision: 'approve' }, staff.email);
  if (!d.ok) throw new Error('staff approve: ' + JSON.stringify(d).slice(0, 200));
  return { id: r.id, host };
}

export default [
 { name: '«Скоро»: tiles = event.soon; «Скрыть» → toast «Вернуть» brings it back; hidden again survives a reload', persona: 'full', run: async t => {
   let made = null; const hid = new Set();
   try {
     for (const id of await hiddenEvents(t)) await t.api('feedHide.set', { opId: t.uuid7(), kind: 'event', targetId: id, on: false });
     let items = await soon(t);
     if (!items.length) { made = await hostOnline(t); items = await until(async () => { const l = await soon(t); return l.length ? l : null; }, 'event.soon offers the new event'); }
     await t.go('/n/feed');
     await t.see('.feed-ev.k-fev-block');
     await t.see('.feed-ev small:has-text("Скоро")');
     const shown = (await t.page.locator('.feed-ev .k-fev .evc .bd b').allInnerTexts()).map(s => s.trim());
     expect(JSON.stringify(shown) === JSON.stringify(items.map(e => e.title)), `tiles ${JSON.stringify(shown)} vs server ${JSON.stringify(items.map(e => e.title))}`);
     const first = items[0];
     // «Скрыть» → the tile leaves at once, the toast offers «Вернуть», which brings it back.
     await t.tap(`.feed-ev button[aria-label="Скрыть событие «${first.title}»"]`); hid.add(first.id);
     await toastSee(t, 'Событие скрыто');
     expect(!(await t.page.locator(`.feed-ev .evc:has-text("${first.title}")`).count()), 'hidden tile still shown');
     await t.tap('.toast button:has-text("Вернуть")');
     await t.see(`.feed-ev .evc:has-text("${first.title}")`);
     await until(async () => !(await hiddenEvents(t)).includes(first.id), '«Вернуть» unhid it');
     // Hidden again: in «Скрытое», out of event.soon, and a reload keeps it out.
     await t.tap(`.feed-ev button[aria-label="Скрыть событие «${first.title}»"]`);
     await until(async () => (await hiddenEvents(t)).includes(first.id), 'feedHide.list has the event');
     expect(!(await soon(t)).some(e => e.id === first.id), 'event.soon still offers the hidden event');
     await t.go('/n/feed'); await t.see('.posts article.post'); await t.see('.feed-ev.k-fev-block, .posts');
     await t.notSee(`.feed-ev .evc:has-text("${first.title}")`, 2500);
     // The tile opens the event.
     if (items.length > 1) { await t.tap(`.feed-ev .evc:has-text("${items[1].title}")`); await t.page.waitForURL(new RegExp('/n/events/' + items[1].id), { timeout: 15000 }); }
     await t.shot('feed-soon');
   } finally {
     for (const id of hid) await t.api('feedHide.set', { opId: t.uuid7(), kind: 'event', targetId: id, on: false });
     if (made) await t.api('event.cancel', { opId: t.uuid7(), eventId: made.id, reason: 'Сценарий завершён' }, made.host.email);
   }
 } },
 { name: '«Скоро» belongs to «Для тебя» only', persona: 'full', route: '/n/feed', run: async t => {
   await t.see('.posts article.post');
   await t.page.locator('.seg button', { hasText: 'Подписки' }).first().click(); await t.wait(2500);
   expect(!(await t.page.locator('.feed-ev.k-fev-block').count()), '«Скоро» shown in «Подписки»');
 } },
];
