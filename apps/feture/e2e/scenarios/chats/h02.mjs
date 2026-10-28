// H02 conversation: text both ways, realtime, reply, copy, photos (normal / once / timer, age gate, «на проверке»), menu.
// Persona `chats` (both sides age verified): text and photos go to its chat with `mate`, menu actions to its chat with
// `asker`; actions that end a contact use a fresh match with `stranger` (ended, unblocked and archived again).
import { STAFF } from '../../personas.mjs';
import { FIXTURES, until } from '../helpers.mjs';
let T2, KAI, KAIN, TEST2, NOA, MATE, STRANGER; // set per scenario from the personas of the lane (see `init`)
const PHOTO = FIXTURES + 'photo.jpg';
async function init(t) {
  const c = t.me.kind === 'chats' ? t.me : await t.persona('chats');
  T2 = c.with.mate.conversationId; TEST2 = c.with.mate.email; MATE = c.with.mate.handle; KAI = c.with.asker.conversationId; KAIN = c.with.asker.handle;
  const st = await t.persona('stranger'); NOA = st.email; STRANGER = st.handle;
}
const stamp = () => new Date().toISOString().slice(11, 19);
const bubble = (t, text) => t.page.locator('.msgs .msg', { hasText: text });
const lastMsgs = async (t, as) => (await t.api('chat.messages', { conversationId: T2 }, as)).items ?? [];
const openMenu = async t => { await t.tap('css=header button[aria-label="Информация о диалоге"]'); await t.see('.sheet.on'); };
const ready = async t => { await t.see('.msgs .msg.sys', 30000); };
const pickPhoto = async t => {
  await t.tap('button[aria-label="Вложение"]');
  const chooser = t.page.waitForEvent('filechooser');
  await t.tap('.sheet .li:has-text("Из галереи")');
  await (await chooser).setFiles(PHOTO);
  await t.see('.sheet.on:has-text("Отправить: фото")');
};

/** A fresh match test1 ↔ noa; returns {me, noa, conv}. */
async function freshMatch(t) {
  const me = (await t.api('session.bootstrap', {})).profiles.find(p => p.kind === 'person').id;
  const noa = (await t.api('session.bootstrap', {}, NOA)).profiles.find(p => p.kind === 'person').id;
  await t.api('block.set', { opId: t.uuid7(), profileId: noa, on: false });
  await t.api('like.send', { opId: t.uuid7(), profileId: noa, source: 'profile' });
  const b = await t.api('like.send', { opId: t.uuid7(), profileId: me, source: 'profile' }, NOA);
  const conv = b.conversationId ?? (await t.api('chats.list', { filter: 'all', archived: false })).items.find(c => c.other.id === noa && c.state === 'active')?.id;
  if (!conv) throw new Error('no conversation with noa: ' + JSON.stringify(b));
  return { me, noa, conv };
}
/** Tidy: unblock, end the match (if still on) and archive the ended chat so test1's list stays clean. */
async function tidy(t, m) {
  if (!m) return;
  await t.api('block.set', { opId: t.uuid7(), profileId: m.noa, on: false });
  await t.api('match.end', { opId: t.uuid7(), profileId: m.me }, NOA);
  await t.api('chat.archive', { conversationId: m.conv, on: true });
}

const scenarios = [
  { name: 'H02 send text: optimistic bubble → delivered, other side gets it via API', persona: 'chats', route: '/n/chats/@T2', run: async t => {
    await ready(t);
    // An empty box offers a voice message (hold the mic) instead of an enabled «Отправить».
    if (await t.page.locator('.inputbar button[aria-label="Отправить"]:enabled').count()) throw new Error('send should not be offered when empty');
    await t.see('.inputbar button[aria-label^="Голосовое"]');
    const body = 'e2e привет ' + stamp();
    await t.fill('.inputbar textarea', body);
    await t.tap('.inputbar .send');
    await t.see(`.msgs .msg.me:has-text("${body}")`);
    if (await t.page.locator('.inputbar textarea').inputValue()) throw new Error('input not cleared');
    await t.page.locator(`.msgs .msg.me:not(.sending):not(.failed):has-text("${body}")`).first().waitFor({ timeout: 20000 });
    const got = (await lastMsgs(t, TEST2)).find(m => m.body === body);
    if (!got || got.mine) throw new Error('test2 does not see the message');
  } },
  { name: 'H02 Enter sends, Shift+Enter makes a new line', persona: 'chats', route: '/n/chats/@T2', run: async t => {
    await ready(t);
    const ta = t.page.locator('.inputbar textarea');
    await ta.click(); await ta.type('строка 1'); await t.page.keyboard.press('Shift+Enter'); await ta.type('строка 2 ' + stamp());
    if (!(await ta.inputValue()).includes('\n')) throw new Error('Shift+Enter did not add a line');
    const body = await ta.inputValue();
    await t.page.keyboard.press('Enter');
    await t.wait(800);
    if (await ta.inputValue()) throw new Error('Enter did not send');
    await t.page.locator('.msgs .msg.me:not(.sending)', { hasText: 'строка 2' }).last().waitFor({ timeout: 20000 });
    await until(async () => (await lastMsgs(t, TEST2)).some(m => m.body === body), 'multi-line message not on server: ' + JSON.stringify(body));
  } },
  { name: 'H02 realtime: a message from the other side appears without reload', persona: 'chats', route: '/n/chats/@T2', run: async t => {
    await ready(t); await t.wait(1500); // the socket joins
    const body = 'e2e от test2 ' + stamp();
    const t0 = Date.now();
    const r = await t.api('chat.send', { opId: t.uuid7(), conversationId: T2, body }, TEST2);
    if (!r.ok) throw new Error('send as test2: ' + JSON.stringify(r));
    await bubble(t, body).first().waitFor({ timeout: 8000 });
    console.log('   realtime delay', Date.now() - t0, 'ms');
    await t.wait(1500);
    const c = (await t.api('chats.list', { filter: 'all', archived: false })).items.find(x => x.id === T2);
    if (c.unread) throw new Error('opened chat should mark it read, unread=' + c.unread);
  } },
  { name: 'H02 realtime: the list moves and counts a new message without reload', persona: 'chats', route: '/n/chats', run: async t => {
    await t.see('.chat-row', 30000); await t.wait(1500);
    const body = 'e2e в список ' + stamp();
    await t.api('chat.send', { opId: t.uuid7(), conversationId: T2, body }, TEST2);
    await t.see(`.chat-row.unread:has-text("${body.slice(0, 20)}")`, 8000);
    const first = await t.page.locator('.chat-row').first().innerText();
    if (!first.includes(MATE)) throw new Error('chat did not move up: ' + first.slice(0, 60));
  } },
  { name: 'H02 reply: message menu → «Ответить» → quote (✕ cancels) → sent with replyTo', persona: 'chats', route: '/n/chats/@T2', run: async t => {
    await ready(t);
    const target = t.page.locator('.msgs .msg:not(.me):not(.sys)').last();
    const quoted = (await target.locator('.mtx').innerText().catch(() => '')).slice(0, 20);
    await target.click({ button: 'right' });
    await t.see('.sheet.on:has-text("Ответить")');
    await t.tap('.sheet .li:has-text("Ответить")');
    await t.see('.chat-reply');
    await t.tap('button[aria-label="Отменить ответ"]');
    await t.notSee('.chat-reply', 500);
    await target.click({ button: 'right' });
    await t.tap('.sheet .li:has-text("Ответить")');
    const body = 'e2e ответ ' + stamp();
    await t.fill('.inputbar textarea', body);
    await t.tap('.inputbar .send');
    await t.page.locator('.msgs .msg.me:not(.sending)', { hasText: body }).locator('.chat-quote').first().waitFor({ timeout: 20000 });
    const m = (await lastMsgs(t, TEST2)).find(x => x.body === body);
    if (!m?.replyTo) throw new Error('replyTo not stored');
    if (quoted && !(await bubble(t, body).first().innerText()).includes(quoted.slice(0, 10))) throw new Error('quote text missing');
  } },
  { name: 'H02 copy own message; their message offers no copy; Esc closes', persona: 'chats', route: '/n/chats/@T2', run: async t => {
    await ready(t);
    await t.page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(t.page.url()).origin });
    const own = t.page.locator('.msgs .msg.me:not(.has-media)').last();
    const text = await own.locator('.mtx').innerText();
    await own.click({ button: 'right' });
    await t.tap('.sheet .li:has-text("Копировать")');
    await t.see('Текст скопирован');
    const clip = await t.page.evaluate(() => navigator.clipboard.readText());
    if (clip !== text) throw new Error('clipboard has ' + clip);
    await t.page.locator('.msgs .msg:not(.me):not(.sys)').last().click({ button: 'right' });
    await t.see('.sheet.on');
    if (await t.page.locator('.sheet .li:has-text("Копировать")').count()) throw new Error('copy offered for their message');
    await t.page.keyboard.press('Escape');
    await t.notSee('.sheet.on', 600);
  } },
  { name: 'H02 too long text is cut at 2000 characters; spaces only cannot be sent', persona: 'chats', route: '/n/chats/@T2', run: async t => {
    await ready(t);
    await t.fill('.inputbar textarea', 'я'.repeat(2100));
    const n = (await t.page.locator('.inputbar textarea').inputValue()).length;
    if (n !== 2000) throw new Error('maxLength not applied: ' + n);
    await t.fill('.inputbar textarea', '   ');
    if (await t.page.locator('.inputbar button[aria-label="Отправить"]:enabled').count()) throw new Error('spaces only should not be sendable');
  } },
  { name: 'H02 attach sheet: ✕, scrim and Esc close it', persona: 'chats', route: '/n/chats/@T2', run: async t => {
    await ready(t);
    await t.tap('button[aria-label="Вложение"]'); await t.see('.sheet.on:has-text("Из галереи")');
    await t.tap('.sheet button[aria-label="Закрыть"]'); await t.notSee('.sheet.on', 500);
    await t.tap('button[aria-label="Вложение"]'); await t.see('.sheet.on');
    await t.page.mouse.click(195, 100); await t.notSee('.sheet.on', 500);
    await t.tap('button[aria-label="Вложение"]'); await t.see('.sheet.on');
    await t.page.keyboard.press('Escape'); await t.notSee('.sheet.on', 500);
  } },
  { name: 'H02 photo normal: gallery → send sheet → sent; the other side gets the photo message', persona: 'chats', route: '/n/chats/@T2', run: async t => {
    await ready(t);
    const before = (await lastMsgs(t)).at(-1)?.seq ?? 0; // the API returns the last 50: compare seq, not count
    await pickPhoto(t);
    await t.see('.sheet .cm-prev img');
    await t.tap('.sheet .sh-f button:has-text("Отправить")');
    await t.page.locator('.sheet.on').waitFor({ state: 'detached', timeout: 45000 });
    await t.page.locator('.msgs .msg.me.has-media').last().waitFor({ timeout: 20000 });
    const all = await lastMsgs(t); const mine = all.at(-1);
    if (!mine || mine.seq <= before || !mine.media) throw new Error('photo message not stored');
    await t.shot('h02-photo-sent');
    const theirs = (await lastMsgs(t, TEST2)).find(m => m.id === mine.id);
    if (!theirs) throw new Error('test2 does not get the photo message');
    console.log('   recipient media', JSON.stringify(theirs.media && { ...theirs.media, src: theirs.media.src && Object.keys(theirs.media.src) }));
  } },
  { name: 'H02 recipient: a photo still in review shows «Фото на проверке», never an empty bubble', persona: 'mate', route: '/n/chats/@T2', run: async t => {
    await ready(t);
    await t.wait(1000);
    const empty = await t.page.evaluate(() => [...document.querySelectorAll('.msgs .msg:not(.sys)')].filter(e => !e.textContent.trim() && !e.querySelector('img')).length);
    if (empty) throw new Error(empty + ' empty bubble(s)');
    await t.shot('h02-recipient-review');
  } },
  { name: 'H02 photo «один просмотр»: «на проверке» with preview; «Не отправлять» during a retry drops it for good', persona: 'chats', allow4xx: true, route: '/n/chats/@T2', run: async t => {
    await ready(t);
    const before = (await lastMsgs(t)).at(-1)?.seq ?? 0; // the API returns the last 50: compare seq, not count
    await pickPhoto(t);
    await t.page.locator('.sheet select').selectOption('once');
    await t.see('.sheet .selv:has-text("Один просмотр")');
    await t.tap('.sheet .sh-f button:has-text("Отправить")');
    await t.see('Фото на проверке — отправится', 45000);
    await t.see('.msgs .msg.me.sending img');
    if (!(await t.page.locator('button[aria-label="Вложение"]').isDisabled())) throw new Error('attach should wait while one is pending');
    await t.shot('h02-once-pending');
    // Regression: the answer of a retry in flight brought a dropped photo back (with a revoked preview).
    await t.tap('.alert.info button:has-text("Отправить ещё раз")');
    await t.tap('.alert.info button:has-text("Не отправлять")');
    await t.notSee('Фото на проверке — отправится', 4000);
    await t.notSee('.msgs .msg.me.sending', 200);
    if (((await lastMsgs(t)).at(-1)?.seq ?? 0) !== before) throw new Error('a pending photo must not be sent');
  } },
  { name: 'H02 age gate: timer photo refused without both ages → plain words + age-check link', persona: 'chats', allow4xx: true, route: '/n/chats/@T2', run: async t => {
    await ready(t);
    // Both test accounts are verified, so the refusal is simulated at the network edge (the server's own body).
    await t.page.route('**/api/fe', async r => {
      const d = r.request().postData() || '';
      if (d.includes('"chat.sendMedia"')) return r.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'rule_violation', rule: 'age_required' }) });
      if (d.includes('"media.uploadIntent"') && d.includes('"viewRule"')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, assetId: '01a17c50-0000-7000-8000-000000000001', upload: { url: new URL('/__e2e_upload', r.request().url()).href, method: 'PUT', headers: {} } }) });
      if (d.includes('"media.commit"') || d.includes('"media.remove"')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return r.fallback();
    });
    await t.page.route('**/__e2e_upload', r => r.fulfill({ status: 200, body: '' }));
    await pickPhoto(t);
    await t.page.locator('.sheet select').selectOption('t15');
    await t.tap('.sheet .sh-f button:has-text("Отправить")');
    await t.see('.sheet .alert.err:has-text("подтвердили возраст")');
    await t.see('.sheet .alert.err a, .sheet .alert.err button');
    await t.shot('h02-age-gate');
    await t.page.keyboard.press('Escape');
    await t.notSee('.sheet.on', 500);
  } },
  { name: 'H02 viewing a «один просмотр» photo: opens once in the viewer, then «Уже просмотрено»', persona: 'chats', route: null, run: async t => {
    const id = await sendEphemeralFromTest2(t, 'once');
    await t.go('/n/chats/' + T2); await ready(t);
    const tile = t.page.locator(`[data-msg-id="${id}"] .mtile.eph2`);
    await tile.waitFor({ timeout: 20000 });
    await tile.click();
    await t.see('.viewer.on img');
    await t.see('.viewer .vw-label:has-text("Один просмотр")');
    await t.shot('h02-once-viewer');
    await t.tap('.viewer button[aria-label="Закрыть"]');
    await t.see(`[data-msg-id="${id}"] .eph-gone:has-text("Уже просмотрено")`);
    const m = (await lastMsgs(t)).find(x => x.id === id);
    if (m.media.state !== 'done') throw new Error('server state ' + m.media.state);
  } },
  { name: 'H02 viewing a timer photo: viewer shows time left, tile keeps counting and opens again', persona: 'chats', route: null, run: async t => {
    const id = await sendEphemeralFromTest2(t, 't15');
    await t.go('/n/chats/' + T2); await ready(t);
    const tile = t.page.locator(`[data-msg-id="${id}"] .mtile.eph2`);
    await tile.waitFor({ timeout: 20000 });
    await tile.click();
    await t.see('.viewer .vw-label:has-text("осталось")');
    await t.page.keyboard.press('Escape');
    await t.see(`[data-msg-id="${id}"] .mtile.eph2.counting`);
    await t.tap(`[data-msg-id="${id}"] .mtile.eph2`);
    await t.see('.viewer.on img');
    await t.page.keyboard.press('Escape');
    const m = (await lastMsgs(t)).find(x => x.id === id);
    if (m.media.state !== 'open') throw new Error('server state ' + m.media.state);
  } },
  { name: 'H02 menu: mute on → off, persisted', persona: 'chats', route: '/n/chats/@KAI', run: async t => {
    await ready(t);
    try {
      await openMenu(t);
      await t.tap('.sheet [role=switch]:has-text("Без звука")');
      await t.see('.sheet [role=switch][aria-checked=true]:has-text("Без звука")');
      let c = (await t.api('chats.list', { filter: 'all', archived: false })).items.find(x => x.id === KAI);
      if (!c.muted) throw new Error('mute not stored');
      await t.tap('.sheet [role=switch]:has-text("Без звука")');
      await t.see('Звук включён');
      await t.see('.sheet [role=switch][aria-checked=false]:has-text("Без звука")');
      c = (await t.api('chats.list', { filter: 'all', archived: false })).items.find(x => x.id === KAI);
      if (c.muted) throw new Error('unmute not stored');
    } finally { await t.api('chat.mute', { conversationId: KAI, on: false }); }
  } },
  { name: 'H02 menu: «Профиль» opens the profile and closes the sheet', persona: 'chats', route: '/n/chats/@KAI', run: async t => {
    await ready(t);
    await openMenu(t);
    await t.tap('.sheet .li:has-text("Профиль")');
    await t.wait(1000);
    if (!t.page.url().includes('/n/people/')) throw new Error('profile not opened: ' + t.page.url());
    if (await t.page.locator('.sheet.on').count()) throw new Error('sheet left open over the profile');
  } },
  { name: 'H02 archive undo from the toast brings the chat back into the list', persona: 'chats', route: '/n/chats/@KAI', run: async t => {
    try {
      await ready(t);
      await openMenu(t);
      await t.tap('.sheet .li:has-text("В архив")');
      await t.see('.toast:has-text("Диалог в архиве")');
      await t.tap('.toast button:has-text("Отменить")');
      await t.see(`.chat-row:has-text("${KAIN}")`, 10000);
      const c = (await t.api('chats.list', { filter: 'all', archived: false })).items.find(x => x.id === KAI);
      if (!c) throw new Error('undo did not unarchive');
    } finally { await t.api('chat.archive', { conversationId: KAI, on: false }); }
  } },
  { name: 'H02 end contact: confirm sheet, cancel keeps it, confirm ends it (input gone, banner shown)', persona: 'chats', route: null, run: async t => {
    let m;
    try {
      m = await freshMatch(t);
      await t.go('/n/chats/' + m.conv); await ready(t);
      await openMenu(t);
      await t.tap('.sheet .li:has-text("Прекратить общение")');
      await t.see('.sheet.on .sh-f button:has-text("Отмена")');
      await t.tap('.sheet .sh-f button:has-text("Отмена")');
      await t.notSee('.sheet.on', 500);
      await openMenu(t);
      await t.tap('.sheet .li:has-text("Прекратить общение")');
      await t.tap('.sheet .sh-f button:has-text("Прекратить общение")');
      await t.see('Общение прекращено');
      await t.notSee('.inputbar', 300);
      const r = await t.api('chat.messages', { conversationId: m.conv });
      if (r.state !== 'ended') throw new Error('server state ' + r.state);
    } finally { await tidy(t, m); }
  } },
  { name: 'H02 report: needs a reason and a message, sends with the selected message', persona: 'chats', route: null, run: async t => {
    let m;
    try {
      m = await freshMatch(t);
      const body = 'e2e сообщение для жалобы ' + stamp();
      await t.api('chat.send', { opId: t.uuid7(), conversationId: m.conv, body }, NOA);
      await t.go('/n/chats/' + m.conv); await ready(t);
      await t.see(`.msg:has-text("${body}")`);
      await openMenu(t);
      await t.tap('.sheet .li:has-text("Пожаловаться")');
      await t.see('.sheet.on .check');
      await t.tap('.sheet .sh-f button:has-text("Отправить жалобу")');
      await t.see('.sheet .ferr:has-text("Выбери причину")'); await t.see('.sheet .ferr:has-text("Опиши, что случилось")');
      await t.tap('.sheet .radio:has-text("Другое")');
      await t.tap('.sheet .sh-f button:has-text("Отправить жалобу")');
      await t.see('.sheet .alert.err:has-text("Отметь хотя бы одно")');
      await t.tap(`.sheet .check:has-text("${body}")`);
      await t.see('.sheet .check[aria-checked=true]');
      await t.fill('.sheet textarea', 'e2e проверка жалобы, не обрабатывать');
      await t.tap('.sheet [role=switch]:has-text("Также заблокировать")'); // off: stay in the chat
      await t.tap('.sheet .sh-f button:has-text("Отправить жалобу")');
      await t.see('Жалоба отправлена');
      await t.notSee('.sheet.on', 300);
    } finally { await tidy(t, m); }
  } },
  { name: 'H02 block: confirm → back to the list, the chat is gone', persona: 'chats', route: null, run: async t => {
    let m;
    try {
      m = await freshMatch(t);
      await t.api('chat.send', { opId: t.uuid7(), conversationId: m.conv, body: 'e2e до блокировки' }, NOA);
      await t.go('/n/chats/' + m.conv); await ready(t);
      await openMenu(t);
      await t.tap('.sheet .li:has-text("Заблокировать")');
      await t.see('.sheet.on h2:has-text("Заблокировать")');
      await t.tap('.sheet .sh-f button:has-text("Заблокировать")');
      await t.see('.chat-row', 30000);
      if (!t.page.url().endsWith('/n/chats')) throw new Error('not back on the list: ' + t.page.url());
      await t.notSee(`.chat-row:has-text("${STRANGER}")`, 500);
      const b = await t.api('blocks.list', {});
      if (!JSON.stringify(b).includes(m.noa)) throw new Error('block not stored');
    } finally { await tidy(t, m); }
  } },
];

/** test2 uploads a photo with a view rule, the moderator approves it, test2 sends it to test1. */
async function sendEphemeralFromTest2(t, mode) {
  const rule = mode === 'once' ? { viewRule: 'once' } : { viewRule: 'timer', viewSeconds: 60 };
  const fs = await import('node:fs');
  const bytes = fs.readFileSync(PHOTO);
  const i = await t.api('media.uploadIntent', { opId: t.uuid7(), purpose: 'chat', kind: 'image', mime: 'image/jpeg', bytes: bytes.length, ...rule }, TEST2);
  if (!i.ok) throw new Error('uploadIntent ' + JSON.stringify(i));
  const put = await fetch(i.upload.url, { method: i.upload.method, headers: i.upload.headers, body: bytes });
  if (!put.ok) throw new Error('upload PUT ' + put.status);
  const c = await t.api('media.commit', { assetId: i.assetId }, TEST2);
  if (!c.ok) throw new Error('commit ' + JSON.stringify(c));
  // The scan runs after commit; the moderator can decide once it waits for review with its copies made.
  for (let k = 0; ; k++) {
    const d = await t.api('staff.mediaDecide', { opId: t.uuid7(), assetId: i.assetId, decision: 'approve', explicit: false }, STAFF);
    if (d.ok || d.state === 'approved') break;
    if (k > 30 || !(d.state && ['uploaded', 'scanning'].includes(d.state) || d.rule === 'no_copies')) throw new Error('approve ' + JSON.stringify(d));
    await new Promise(r => setTimeout(r, 3000));
  }
  for (let k = 0; k < 20; k++) {
    const s = await t.api('chat.sendMedia', { opId: t.uuid7(), conversationId: T2, assetId: i.assetId, mode }, TEST2);
    if (s.ok) return s.id;
    if (s.rule !== 'pending') throw new Error('sendMedia ' + JSON.stringify(s));
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('ephemeral photo stayed pending');
}

// Routes name the lane's conversations (@T2, @KAI); they are known only once the personas are built.
export default scenarios.map(sc => ({ ...sc, route: null, run: async t => {
  await init(t);
  if (sc.route) await t.go(sc.route.replace('@T2', T2).replace('@KAI', KAI));
  return sc.run(t);
} }));
