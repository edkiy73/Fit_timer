// N01 notifications: tabs, filters, read all, every decision card action (each scenario recreates what it uses up).
// Persona `host` (owns a closed community) decides; the other side is always a persona of the lane: `asker` asks for
// the private part, `mate` proposes a link and follows, `basic` / `stranger` ask to join, a fresh `temp` invites to a
// couple. Declines start cooldowns (access 30 days, couple invites 7 days), so those run on fresh people (`owner`, `temp`).
import { askAccess, cancelAsk, nameOf, outOf } from '../helpers.mjs';
const decisions = async t => (await t.api('decide.list', {})).items ?? [];
const cardOf = (t, name, text) => t.page.locator('.rqcard', { hasText: name }).filter({ hasText: text });

/** `asker` asks the persona for the private part (an open request is reused). Returns {id, name}. */
const ensureAccessRequest = t => askAccess(t, t.me.personId);
/** `mate` proposes a «friend» link to the host (if none is waiting). Returns mate. */
async function ensureLink(t) {
  const mate = await t.persona('mate');
  const mine = await t.api('links.mine', {});
  const confirmed = (mine.confirmed ?? []).find(l => l.other.id === mate.personId);
  if (confirmed) await t.api('link.remove', { opId: t.uuid7(), linkId: confirmed.id });
  if ((mine.incoming ?? []).some(l => l.other.id === mate.personId)) return mate;
  const r = await t.api('link.propose', { opId: t.uuid7(), profileId: t.me.personId, kind: 'friend' }, mate.email);
  if (!r.ok) throw new Error('link.propose ' + JSON.stringify(r));
  return mate;
}
/** Persona `kind` asks to join the host's closed community (leaving first if a member). Returns it with its name. */
async function ensureJoin(t, kind) {
  const p = await t.persona(kind), CLUB = t.me.closedId;
  const reqs = await t.api('community.requests', { communityId: CLUB });
  if (!(reqs.items ?? []).some(r => r.profile?.id === p.personId)) {
    await t.api('community.leave', { opId: t.uuid7(), communityId: CLUB }, p.email);
    const r = await t.api('community.join', { opId: t.uuid7(), communityId: CLUB, rulesAccepted: true, answer: 'Хочу участвовать, правила прочитаны.' }, p.email);
    if (!r.ok) throw new Error('community.join ' + JSON.stringify(r));
  }
  return { ...p, name: await nameOf(t, p) };
}
/** Takes back what the setups left waiting: the asker's request, join requests, the link from `mate`. */
async function tidy(t) {
  if (t.me.kind !== 'host') return;
  const a = await t.persona('asker');
  for (const r of (await t.api('access.lists', { tab: 'out' }, a.email)).items ?? []) if (r.state === 'pending' && r.profile?.id === t.me.personId) await cancelAsk(t, { ...a, requestId: r.id });
  for (const k of ['basic', 'stranger']) await outOf(t, t.me.closedId, (await t.persona(k)).email);
  const mate = await t.persona('mate');
  const l = await t.api('links.mine', {});
  for (const x of [...(l.incoming ?? []), ...(l.confirmed ?? []), ...(l.sent ?? [])]) if (x.other?.id === mate.personId) await t.api('link.remove', { opId: t.uuid7(), linkId: x.id });
}
const openTodo = async t => { await t.go('/n/inbox'); await t.see('.rqcard', 30000); };

const scenarios = [
  { name: 'N01 opens on «Нужно решить» with cards; tabs switch; no empty state next to cards', persona: 'host', route: null, run: async t => {
    await ensureAccessRequest(t);
    await openTodo(t);
    await t.see('[role=tab][aria-selected=true]:has-text("Нужно решить")');
    await t.notSee('Всё решено', 300);
    await t.tap('[role=tab]:has-text("Все уведомления")');
    await t.see('.nt', 20000);
    await t.notSee('.rqcard', 300);
    await t.tap('[role=tab]:has-text("Нужно решить")');
    await t.see('.rqcard');
    await t.shot('n01-todo');
  } },
  { name: 'N01 filters: a chip narrows the cards, «Все» resets; switching tabs resets the filter', persona: 'host', route: null, run: async t => {
    await ensureAccessRequest(t); const j = await ensureJoin(t, 'temp'); // fresh: see «Одобрить» below
    try {
    await openTodo(t);
    await t.tap('.inbox-filters .chip:has-text("Сообщества")');
    await t.see('.inbox-filters .chip.on:has-text("Сообщества")');
    const texts = await t.page.locator('.rqcard').allInnerTexts();
    if (!texts.length || texts.some(x => !x.includes('Заявка в сообщество'))) throw new Error('filter shows other kinds: ' + texts.map(x => x.slice(0, 40)).join(' | '));
    await t.tap('.inbox-filters .chip:has-text("Все")');
    if ((await t.page.locator('.rqcard').count()) <= texts.length) throw new Error('«Все» did not bring the rest back');
    await t.tap('.inbox-filters .chip:has-text("Доступы")');
    await t.tap('[role=tab]:has-text("Все уведомления")');
    await t.see('.inbox-filters .chip.on:has-text("Все")');
    } finally { await outOf(t, t.me.closedId, j.email); }
  } },
  { name: 'N01 «Прочитать все» marks every notification read (server too) and hides itself', persona: 'host', route: null, run: async t => {
    // At least one unread notification: `mate` follows the host again.
    const mate = await t.persona('mate');
    await t.api('follow.set', { opId: t.uuid7(), profileId: t.me.personId, on: false }, mate.email);
    await t.api('follow.set', { opId: t.uuid7(), profileId: t.me.personId, on: true }, mate.email);
    await t.go('/n/inbox');
    await t.tap('[role=tab]:has-text("Все уведомления")');
    await t.see('.nt', 20000);
    if (!(await t.page.locator('.nt.unread').count())) { console.log('   (nothing unread, skipping the tap)'); return; }
    await t.tap('.inbox-read-all');
    await t.see('Все прочитаны');
    await t.notSee('.nt.unread', 300);
    await t.notSee('.inbox-read-all', 100);
    const n = await t.api('notifications.list', {});
    if ((n.items ?? []).some(x => !x.read)) throw new Error('server still has unread');
  } },
  { name: 'N01 a notification row opens its target', persona: 'host', route: '/n/inbox', run: async t => {
    await t.tap('[role=tab]:has-text("Все уведомления")');
    await t.see('.nt', 20000);
    const url = t.page.url();
    await t.tap('.nt');
    await t.wait(1200);
    if (t.page.url() === url) throw new Error('row did not open anything');
  } },
  { name: 'N01 access request: «Посмотреть» → grant sheet → open for 7 days → granted on server', persona: 'host', route: null, run: async t => {
    const a = await ensureAccessRequest(t);
    try {
      await openTodo(t);
      await cardOf(t, a.name, 'Просит открыть').locator('button:has-text("Посмотреть")').click();
      await t.wait(1000);
      if (!t.page.url().includes('/n/me')) throw new Error('not on Me: ' + t.page.url());
      await t.see(`.rqcard:has-text("${a.name}")`, 30000);
      await t.tap(`.rqcard:has-text("${a.name}") button:has-text("Открыть доступ")`);
      await t.see(`.sheet.on:has-text("${a.name} просит доступ")`);
      await t.tap('.sheet .sh-f button:has-text("Открыть на 7 дней")');
      await t.see('.toast:has-text("Открыто для")'); // «Открыто для {name}» (the grant sheet's result)
      const byme = await t.api('access.lists', { tab: 'byme' });
      if (!(byme.items ?? []).some(x => x.profile?.id === a.id)) throw new Error('grant not on server');
      if ((await decisions(t)).some(d => d.kind === 'req' && d.actor?.id === a.id)) throw new Error('decision still listed');
    } finally { await t.api('access.revoke', { opId: t.uuid7(), profileId: a.id }); }
  } },
  { name: 'N01 access request: «Отклонить» on the card declines it', persona: 'owner', route: null, run: async t => {
    const a = await ensureAccessRequest(t);
    await openTodo(t);
    await cardOf(t, a.name, 'Просит открыть').locator('button:has-text("Отклонить")').click();
    await t.see('.toast:has-text("Отказано")'); // «Отказано. {name} увидит …» with «Отменить»
    // The last card decided: «Нужно решить» stays, with its own empty state (no jump to «Все уведомления»).
    await t.see('Всё решено');
    await t.see('[role=tab][aria-selected="true"]:has-text("Нужно решить")', 3000);
    if ((await decisions(t)).some(d => d.kind === 'req' && d.actor?.id === a.id)) throw new Error('still pending on server');
  } },
  { name: 'N01 link proposal: «Подтвердить» confirms it', persona: 'host', route: null, run: async t => {
    const m = await ensureLink(t), mia = m.personId, name = await nameOf(t, m);
    try {
      await openTodo(t);
      await cardOf(t, name, 'связь').locator('button:has-text("Подтвердить")').click();
      await t.see('Готово');
      const l = await t.api('links.mine', {});
      if (!(l.confirmed ?? []).some(x => x.other.id === mia)) throw new Error('link not confirmed on server');
    } finally { await tidy(t); }
  } },
  { name: 'N01 link proposal: «Отклонить» declines it', persona: 'host', route: null, run: async t => {
    const m = await ensureLink(t), mia = m.personId, name = await nameOf(t, m);
    try {
      await openTodo(t);
      await cardOf(t, name, 'связь').locator('button:has-text("Отклонить")').click();
      await t.see('Отклонено');
      const l = await t.api('links.mine', {});
      if ((l.incoming ?? []).some(x => x.other.id === mia) || (l.confirmed ?? []).some(x => x.other.id === mia)) throw new Error('link still there');
    } finally { await tidy(t); }
  } },
  { name: 'N01 community request: «Одобрить» makes a member', persona: 'host', route: null, run: async t => {
    // A fresh person: `basic` may still be held a week by a decline in an older run (communities/host.mjs C11 declined it).
    const j = await ensureJoin(t, 'temp'), lina = j.personId, CLUB = t.me.closedId;
    try {
      await openTodo(t);
      await cardOf(t, j.name, 'Заявка в сообщество').locator('button:has-text("Одобрить")').click();
      await t.see('Одобрено');
      const reqs = await t.api('community.requests', { communityId: CLUB });
      if ((reqs.items ?? []).some(r => r.profile?.id === lina)) throw new Error('request still pending');
    } finally { await t.api('community.leave', { opId: t.uuid7(), communityId: CLUB }, j.email); }
  } },
  { name: 'N01 community request: «Отклонить» declines', persona: 'host', route: null, run: async t => {
    // A decline holds that person's next request for a week (and `stranger` is asked in by communities/host.mjs too),
    // so a fresh `temp` person asks each run.
    const j = await ensureJoin(t, 'temp'), ari = j.personId, CLUB = t.me.closedId;
    try {
      await openTodo(t);
      await cardOf(t, j.name, 'Заявка в сообщество').locator('button:has-text("Отклонить")').click();
      await t.see('Отклонено');
      const reqs = await t.api('community.requests', { communityId: CLUB });
      if ((reqs.items ?? []).some(r => r.profile?.id === ari)) throw new Error('request still pending');
    } finally { await t.api('community.leave', { opId: t.uuid7(), communityId: CLUB }, j.email); }
  } },
  { name: 'N01 couple invite: card with «Принять» / «Отклонить»; «Отклонить» answers it', persona: 'host', route: null, run: async t => {
    // A «no» starts a 7-day cooldown for that inviter, so a fresh `temp` person invites each run.
    const tmp = await t.persona('temp'), from = tmp.email, name = tmp.handle;
    const inv = await t.api('couple.invite', { opId: t.uuid7(), handle: t.me.handle }, from);
    if (!inv.id) throw new Error('couple.invite ' + JSON.stringify(inv));
    try {
      await openTodo(t);
      const card = cardOf(t, name, 'пару');
      await card.locator('button:has-text("Принять")').waitFor({ timeout: 20000 });
      await card.locator('button:has-text("Отклонить")').click();
      await t.see('Отклонено');
      const ci = await t.api('couple.invites', {});
      if ((ci.incoming ?? []).some(x => x.state === 'pending')) throw new Error('invite still pending');
    } finally {
      const ci = await t.api('couple.invites', {}, from);
      for (const x of ci.outgoing ?? []) if (x.state === 'pending') await t.api('couple.inviteWithdraw', { opId: t.uuid7(), inviteId: x.id }, from);
    }
  } },
  { name: 'N01 bell in the chats header opens the inbox', persona: 'chats', route: '/n/chats', run: async t => {
    await t.see('.chat-row', 30000);
    await t.tap('button[aria-label^="Уведомления"]');
    await t.wait(800);
    if (!t.page.url().includes('/n/inbox')) throw new Error('bell did not open the inbox');
  } },
];

export default scenarios.map(sc => ({ ...sc, run: async t => { try { await sc.run(t); } finally { await tidy(t); } } }));
