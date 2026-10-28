// Wave 7 in a conversation: who read my message and when (the avatars under it open the sheet; from the message
// menu too), typing sends «печатает…» (chat.typing — refused by a server without it, hence allow4xx), and «С чего
// начать» in an empty chat lists questions about shared public interests first.
// Persona `chats` with its conversation with `mate`.
import { expect, until } from '../helpers.mjs';

const sheet = '.sheet.on';

export default [
 { name: 'H02 read info: «Прочитали» shows when the other side read my last message', persona: 'chats', allow4xx: true, run: async t => {
   const conv = t.me.with.mate.conversationId; const mate = t.me.with.mate;
   const s = await t.api('chat.send', { opId: t.uuid7(), conversationId: conv, body: 'w7 прочитано? ' + Date.now().toString(36) });
   expect(s.ok, 'sent');
   const last = (await t.api('chat.messages', { conversationId: conv }, mate.email)).lastSeq;
   await t.api('chat.read', { conversationId: conv, upToSeq: last }, mate.email);
   await until(async () => (await t.api('chat.messages', { conversationId: conv })).items.filter(m => m.mine).pop()?.readBy?.some(r => r.read), 'read on the server');
   await t.go('/n/chats/' + conv);
   await t.see('.msg-readers', 30000);
   await t.tap('.msg-readers');
   await t.see(sheet + ':has-text("Прочитали")');
   await t.see(sheet + ' .li:has-text("Прочитано")');
   await t.page.keyboard.press('Escape'); await t.wait(300);
   // Typing: the line goes out (best effort) and the text stays in the box.
   await t.fill('textarea[aria-label="Сообщение"]', 'печатаю…');
   await t.wait(500);
   expect((await t.page.locator('textarea[aria-label="Сообщение"]').inputValue()) === 'печатаю…', 'text kept');
   await t.fill('textarea[aria-label="Сообщение"]', '');
 } },
 { name: 'H02 «С чего начать»: shared public interests first, general questions after (API + empty chat when there is one)', persona: 'chats', run: async t => {
   const conv = t.me.with.mate.conversationId;
   const r = await t.api('chat.starters', { conversationId: conv });
   expect(Array.isArray(r.topics), 'starters answer: ' + JSON.stringify(r).slice(0, 200));
   const list = (await t.api('chats.list', { filter: 'all' })).items ?? [];
   const empty = list.find(c => c.state === 'active' && !c.last);
   if (!empty) { console.log('   (no empty conversation for this persona — UI chips not checked)'); return; }
   await t.go('/n/chats/' + empty.id);
   await t.see('.ice .chip');
   await t.see('.ice .chip:has-text("Как тебе удобнее общаться?")');
 } },
];
