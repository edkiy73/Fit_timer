// Message requests (owner 29.10.2026): «Написать» without a mutual like opens the chat composer as a request; the
// recipient finds it in «Чаты → Запросы» (who, where you know each other from), and answers, hides or reports + blocks
// it; «Кто может написать первым» in «Я → Видимость» decides who may send one; 10 a day; couples send (with the partner's
// approval when asked) and receive; a mutual like still opens a chat at once. Lane `mr`.
// Senders are fresh `temp` personas, so a hidden request (30 days) or the daily limit never blocks a rerun; recipients
// are the lane's `basic`, `stranger`, `host` and `pair`, each restored at the end (settings, blocks, RSVPs, hides).
import { FIXTURES, expect, sheet, toastSee, until } from '../helpers.mjs';

const PHOTO = FIXTURES + 'photo.jpg';
const box = '.inputbar textarea';
const sendBtn = '.inputbar button[aria-label="Отправить"]';
const actAs = (t, id) => t.page.addInitScript(v => { try { sessionStorage.setItem('feture.fe.acting', v); } catch { /* none */ } }, id);
const stamp = () => Date.now().toString(36);
/** The pending request from `fromId` in `as`'s «Запросы». */
const requestFrom = async (t, as, fromId) => ((await t.api('chats.list', { filter: 'all' }, as.email)).requests ?? []).find(r => r.other.id === fromId);
const setFrom = (t, as, value, profile) => t.api('profile.setVisibility', { opId: t.uuid7(), setting: 'messagesFrom', value }, as.email, profile);
/** A fresh sender with a request to `to` sent through the API (the follow makes «known» let it through). */
async function sentBy(t, to, body, profile) {
  const s = await t.persona('temp');
  await t.api('follow.set', { opId: t.uuid7(), profileId: profile ?? to.personId, on: true }, s.email);
  const r = await t.api('chat.request', { opId: t.uuid7(), profileId: profile ?? to.personId, body }, s.email);
  expect(r.state === 'request', 'request sent: ' + JSON.stringify(r).slice(0, 200));
  return { s, conv: r.conversationId };
}
/** Opens «Чаты → Запросы» and the request from `name`. */
async function openRequest(t, name) {
  await t.go('/n/chats');
  await t.tap('.li:has-text("Запросы")');
  await t.see('.chat-row:has-text("' + name + '")');
  await t.tap('.chat-row:has-text("' + name + '")');
  await t.see('.alert:has-text("хочет начать переписку")');
}

export default [
 { name: 'profile «Написать» → the composer as a request → one message → «Подожди ответа»', persona: 'temp', run: async t => {
   const to = await t.persona('basic');
   await setFrom(t, to, 'known');
   await t.api('follow.set', { opId: t.uuid7(), profileId: to.personId, on: true });
   await t.go('/n/people/' + to.personId);
   await t.see('.p-acts button[aria-label="Написать"]');
   await t.shot('mr-profile');
   await t.tap('.p-acts button[aria-label="Написать"]');
   await t.see('.alert:has-text("Это запрос.")');
   await t.see('.alert:has-text("увидит сообщение и решит, отвечать ли")');
   await t.shot('mr-composer');
   const text = 'mr привет ' + stamp();
   await t.fill(box, text);
   await t.tap(sendBtn);
   await t.see('.alert:has-text("Подожди ответа")');
   await t.see('.msgs .msg.me:has-text("' + text + '")');
   await t.notSee(box, 500);
   // The server keeps it to one message until the recipient answers.
   const r = await requestFrom(t, to, t.me.personId);
   expect(r && r.last?.body === text, 'the recipient has the request');
   expect(r.request.context.some(c => c.kind === 'follows'), 'context: follows');
   const again = await t.api('chat.send', { opId: t.uuid7(), conversationId: r.id, body: 'ещё' });
   expect(again.rule === 'request_pending', 'second message refused: ' + JSON.stringify(again));
   // The recipient's tab badge counts it; reading it does not tell the sender.
   expect((await t.api('inbox.counts', {}, to.email)).requests >= 1, 'requests counted');
   await t.api('chat.read', { conversationId: r.id, upToSeq: 1 }, to.email);
   expect((await t.api('chat.messages', { conversationId: r.id })).otherRead === 0, 'not read for the sender');
   // The recipient answers here (the next scenario answers in the app): both write.
   await t.api('chat.requestAnswer', { opId: t.uuid7(), conversationId: r.id, answer: 'accept' }, to.email);
   await t.page.reload(); await t.wait(1500);
   await t.see(box);
   expect((await t.api('chat.send', { opId: t.uuid7(), conversationId: r.id, body: 'mr ответили!' })).seq === 2, 'sender writes after the answer');
 } },

 { name: 'recipient: «Запросы» folder with a count, context, «Ответить» → a normal chat both write in', persona: 'basic', run: async t => {
   const { s, conv } = await sentBy(t, t.me, 'mr вопрос ' + stamp());
   await t.go('/n/chats');
   await t.see('.li:has-text("Запросы")');
   await t.shot('mr-folder');
   await t.tap('.li:has-text("Запросы")');
   await t.see('.chat-row:has-text("' + s.handle + '")');
   await t.see('.chat-row:has-text("Твой подписчик")');
   await t.shot('mr-requests');
   await t.tap('.chat-row:has-text("' + s.handle + '")');
   await t.see('.alert:has-text("хочет начать переписку")');
   await t.see('.alert:has-text("не узнает, что сообщение прочитано")');
   await t.shot('mr-request-open');
   expect((await t.api('chat.messages', { conversationId: conv }, s.email)).otherRead === 0, 'opening did not mark it read');
   await t.tap('.alert button:has-text("Ответить")');
   await t.see(box);
   await t.fill(box, 'mr да, привет');
   await t.tap(sendBtn);
   await until(async () => (await t.api('chat.messages', { conversationId: conv }, s.email)).items.some(m => m.body === 'mr да, привет'), 'sender got the answer');
   expect((await t.api('chat.send', { opId: t.uuid7(), conversationId: conv, body: 'mr ура' }, s.email)).seq, 'sender writes back');
   expect(!(await requestFrom(t, t.me, s.personId)), 'no longer a request');
 } },

 { name: '«Скрыть»: gone for the recipient, the sender is not told and waits; a second request waits too', persona: 'basic', run: async t => {
   const { s, conv } = await sentBy(t, t.me, 'mr скрой меня ' + stamp());
   await openRequest(t, s.handle);
   await t.tap('.alert button:has-text("Скрыть")');
   await toastSee(t, 'Запрос скрыт');
   expect(!(await requestFrom(t, t.me, s.personId)), 'gone from «Запросы»');
   const view = await t.api('chat.messages', { conversationId: conv }, s.email);
   expect(view.request?.role === 'sender' && view.otherRead === 0, 'the sender sees it waiting as before');
   const again = await t.api('chat.request', { opId: t.uuid7(), profileId: t.me.personId, body: 'ну ответь' }, s.email);
   expect(again.rule === 'request_pending', '30 days before another: ' + JSON.stringify(again));
   expect((await t.api('chat.messages', { conversationId: conv })).status === 404, 'not found for the recipient');
 } },

 { name: '«Пожаловаться» (report + block): report sheet with the message picked, a block, the request gone', persona: 'basic', run: async t => {
   const { s } = await sentBy(t, t.me, 'mr реклама подписывайся ' + stamp());
   try {
     await openRequest(t, s.handle);
     await t.tap('.alert button:has-text("Пожаловаться")');
     await t.see(sheet + ':has-text("Пожаловаться")');
     await t.tap(sheet + ' .radio:has-text("Спам")');
     await t.fill('#report-details', 'Рассылает рекламу незнакомым людям');
     await t.tap(sheet + ' button:has-text("Отправить жалобу")');
     await toastSee(t, 'Жалоба отправлена');
     expect((await t.api('chat.with', { profileId: t.me.personId }, s.email)).status === 404, 'sender blocked');
     expect(!(await requestFrom(t, t.me, s.personId)), 'request gone');
   } finally { await t.api('block.set', { opId: t.uuid7(), profileId: s.personId, on: false }); }
 } },

 { name: 'a stranger (default «known») is told why first; no composer opens', persona: 'temp', run: async t => {
   const to = await t.persona('basic');
   await setFrom(t, to, 'known');
   await t.go('/n/people/' + to.personId);
   await t.tap('.p-acts button[aria-label="Написать"]');
   await t.see('.alert:has-text("Написать пока нельзя")');
   await t.see('.alert:has-text("только от подписчиков")');
   await t.notSee(box, 500);
   expect((await t.api('chat.request', { opId: t.uuid7(), profileId: to.personId, body: 'привет' })).rule === 'messages_known', 'server refuses');
 } },

 { name: 'a member of the same community writes from the member list; context «Участник сообщества»', persona: 'temp', run: async t => {
   const host = await t.persona('host');
   await t.api('community.join', { opId: t.uuid7(), communityId: host.openId, rulesAccepted: true });
   try {
     await t.go('/n/communities/' + host.openId + '?t=members');
     await t.tap('button[aria-label^="Написать"]');
     await t.see('.alert:has-text("Это запрос.")');
     await t.fill(box, 'mr из сообщества ' + stamp());
     await t.tap(sendBtn);
     await t.see('.alert:has-text("Подожди ответа")');
     const r = await requestFrom(t, host, t.me.personId);
     expect(r?.request.context.some(c => c.kind === 'community'), 'context community: ' + JSON.stringify(r?.request));
     await t.api('chat.requestAnswer', { opId: t.uuid7(), conversationId: r.id, answer: 'hide' }, host.email);
   } finally { await t.api('community.leave', { opId: t.uuid7(), communityId: host.openId }).catch(() => {}); }
 } },

 { name: 'an event attendee writes from «Кто идёт»; context «Идёт на … дата»', persona: 'temp', run: async t => {
   const host = await t.persona('host'); const st = await t.persona('stranger');
   await setFrom(t, st, 'known');
   await t.api('event.rsvp', { opId: t.uuid7(), eventId: host.eventId, status: 'going', showInList: true }, st.email);
   await t.api('event.rsvp', { opId: t.uuid7(), eventId: host.eventId, status: 'going', showInList: true });
   try {
     await t.go('/n/events/' + host.eventId + '/attendees');
     await t.tap('button[aria-label^="Написать ' + st.handle + '"], button[aria-label^="Написать @' + st.handle + '"]');
     await t.see('.alert:has-text("Это запрос.")');
     await t.fill(box, 'mr тоже иду ' + stamp());
     await t.tap(sendBtn);
     await t.see('.alert:has-text("Подожди ответа")');
     const r = await requestFrom(t, st, t.me.personId);
     expect(r?.request.context.some(c => c.kind === 'event'), 'context event');
     await t.api('chat.requestAnswer', { opId: t.uuid7(), conversationId: r.id, answer: 'hide' }, st.email);
   } finally {
     await t.api('event.rsvp', { opId: t.uuid7(), eventId: host.eventId, status: null }, st.email);
     await t.api('event.rsvp', { opId: t.uuid7(), eventId: host.eventId, status: null });
   }
 } },

 { name: '«Кто может написать первым» in «Я → Видимость»: «Никто» refuses even a follower; a block hides the person', persona: 'stranger', run: async t => {
   const s = await t.persona('temp');
   await t.api('follow.set', { opId: t.uuid7(), profileId: t.me.personId, on: true }, s.email);
   try {
     await t.go('/n/me?layer=vis');
     await t.see('.k-radios[aria-label="Кто может написать первым"]');
     await t.page.locator('.k-radios[aria-label="Кто может написать первым"]').scrollIntoViewIfNeeded();
     await t.tap('.k-radios[aria-label="Кто может написать первым"] .radio:has-text("Никто")');
     await until(async () => (await t.api('profile.settings', {})).settings.messagesFrom === 'none', 'setting saved');
     await t.page.keyboard.press('Escape').catch(() => {});
     await t.shot('mr-setting');
     expect((await t.api('chat.with', { profileId: t.me.personId }, s.email)).rule === 'messages_closed', '«Никто» refuses a follower');
     await setFrom(t, t.me, 'known');
     expect((await t.api('chat.with', { profileId: t.me.personId }, s.email)).canRequest === true, 'a follower may again');
     // A block either way: not found.
     await t.api('block.set', { opId: t.uuid7(), profileId: s.personId, on: true });
     expect((await t.api('chat.request', { opId: t.uuid7(), profileId: t.me.personId, body: 'привет' }, s.email)).status === 404, 'blocked → not found');
   } finally {
     await setFrom(t, t.me, 'known');
     await t.api('block.set', { opId: t.uuid7(), profileId: s.personId, on: false });
   }
 } },

 { name: 'a request with one photo through the kit Uploader', persona: 'temp', run: async t => {
   const to = await t.persona('basic');
   await t.api('follow.set', { opId: t.uuid7(), profileId: to.personId, on: true });
   await t.go('/n/chats/new/' + to.personId);
   await t.see('.alert:has-text("Это запрос.")');
   await t.fill(box, 'mr с фото');
   await t.tap('.inputbar button[aria-label="Вложение"]');
   const chooser = t.page.waitForEvent('filechooser');
   await t.tap('.sheet .li:has-text("Из галереи")');
   await (await chooser).setFiles(PHOTO);
   await t.see('.sheet.on .k-uprow:has-text("без геометки")', 20000);
   if (await t.page.locator('.sheet.on:has-text("Как можно смотреть")').count()) throw new Error('a request has no disappearing modes');
   await t.tap('.sheet.on .sh-f button:has-text("Отправить")');
   await t.see('.alert:has-text("Подожди ответа")', 60000);
   const r = await until(() => requestFrom(t, to, t.me.personId), 'request arrived');
   const m = (await t.api('chat.messages', { conversationId: r.id }, to.email)).items[0];
   expect(m.media && m.body === 'mr с фото', 'one message: photo + text');
   await t.api('chat.requestAnswer', { opId: t.uuid7(), conversationId: r.id, answer: 'hide' }, to.email);
 } },

 { name: 'daily limit: 10 new requests, then a clear refusal', persona: 'temp', run: async t => {
   const targets = [];
   for (let i = 0; i < 11; i++) { const p = await t.persona('temp'); await setFrom(t, p, 'all'); targets.push(p); }
   for (let i = 0; i < 10; i++) {
     const r = await t.api('chat.request', { opId: t.uuid7(), profileId: targets[i].personId, body: 'mr лимит ' + i });
     expect(r.state === 'request', 'request ' + i + ': ' + JSON.stringify(r).slice(0, 160));
   }
   const no = await t.api('chat.request', { opId: t.uuid7(), profileId: targets[10].personId, body: 'mr лимит 10' });
   expect(no.status === 429 && no.rule === 'requests_day', '11th refused: ' + JSON.stringify(no));
   await t.go('/n/chats/new/' + targets[10].personId);
   await t.see('.alert:has-text("На сегодня запросы закончились")');
 } },

 { name: 'couple sends as the couple (no approval): «Пара …» to the recipient, the partner sees it waiting', persona: 'pair', run: async t => {
   const to = await t.persona('temp'); await setFrom(t, to, 'all');
   await actAs(t, t.me.coupleId);
   await t.go('/n/people/' + to.personId);
   await t.see('.p-acts button[aria-label="Написать от нас"]');
   await t.shot('mr-profile-couple');
   await t.tap('.p-acts button[aria-label="Написать от нас"]');
   await t.see('.alert:has-text("Это запрос.")');
   await t.fill(box, 'mr от пары ' + stamp());
   await t.tap('.inputbar button[aria-label="Отправить от пары"]');
   await t.see('.alert:has-text("Подожди ответа")');
   const r = await requestFrom(t, to, t.me.coupleId);
   expect(r?.other.kind === 'couple', 'the recipient sees the couple');
   const partner = (await t.api('chats.list', { filter: 'all' }, t.me.partner.email)).items.find(c => c.id === r.id);
   expect(partner?.request?.role === 'sender', 'the partner sees it waiting');
 } },

 { name: 'couple sends with the partner approving first contacts: waits, the partner approves, it arrives', persona: 'pair', run: async t => {
   const to = await t.persona('temp'); await setFrom(t, to, 'all');
   const pb = t.me.partner;
   await t.api('couple.setup', { opId: t.uuid7(), mode: 'approve', requestsFrom: 'all' }, pb.email, t.me.coupleId);
   try {
     await actAs(t, t.me.coupleId);
     await t.go('/n/chats/new/' + to.personId);
     await t.fill(box, 'mr через согласие ' + stamp());
     await t.tap('.inputbar button[aria-label="Отправить от пары"]');
     await toastSee(t, 'Отправлено партнёру');
     expect(!(await requestFrom(t, to, t.me.coupleId)), 'nothing before approval');
     const ap = (await t.api('decide.approvals', {}, pb.email, t.me.coupleId)).items.find(a => a.kind === 'chat.request' && a.preview?.profile?.id === to.personId);
     expect(ap, 'the partner has it to decide');
     expect((await t.api('decide.approval', { opId: t.uuid7(), approvalId: ap.id, choice: 'approve' }, pb.email, t.me.coupleId)).state === 'approved', 'approved');
     expect(await until(() => requestFrom(t, to, t.me.coupleId), 'arrived'), 'arrived after approval');
   } finally { await t.api('couple.setup', { opId: t.uuid7(), mode: 'trust', requestsFrom: 'all' }, pb.email, t.me.coupleId); }
 } },

 { name: 'couple receives: both partners see it; the other partner answers; both sides write', persona: 'pb', run: async t => {
   const pa = await t.persona('pair');
   await setFrom(t, pa, 'all', pa.coupleId);
   const { s, conv } = await sentBy(t, pa, 'mr привет паре ' + stamp(), pa.coupleId);
   expect(await requestFrom(t, pa, s.personId), 'the first partner has it');
   await actAs(t, pa.coupleId);
   await openRequest(t, s.handle);
   await t.tap('.alert button:has-text("Ответить")');
   await t.see(box);
   await t.fill(box, 'mr отвечаем от пары');
   await t.tap('.inputbar button[aria-label="Отправить от пары"]');
   await until(async () => (await t.api('chat.messages', { conversationId: conv }, s.email)).items.length === 2, 'the sender got it');
   expect((await t.api('chat.send', { opId: t.uuid7(), conversationId: conv, body: 'mr спасибо' }, pa.email, pa.coupleId)).seq, 'the other partner writes too');
   await setFrom(t, pa, 'known', pa.coupleId);
 } },

 { name: 'a mutual like still opens a chat at once — no request', persona: 'temp', run: async t => {
   const b = await t.persona('temp');
   await t.api('like.send', { opId: t.uuid7(), profileId: b.personId, source: 'profile' });
   const m = await t.api('like.send', { opId: t.uuid7(), profileId: t.me.personId, source: 'profile' }, b.email);
   expect(m.state === 'matched' && m.conversationId, 'matched: ' + JSON.stringify(m).slice(0, 160));
   const w = await t.api('chat.with', { profileId: b.personId });
   expect(w.conversationId === m.conversationId && !w.request, 'the chat, no request');
   await t.go('/n/people/' + b.personId);
   await t.tap('.p-acts button:has-text("Написать")');
   await t.see(box);
   if (await t.page.locator('.alert:has-text("Это запрос")').count()) throw new Error('a match is not a request');
 } },
];
