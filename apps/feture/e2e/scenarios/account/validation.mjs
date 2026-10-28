// Text field validation (kit/validate + contracts/_text.mjs): hostile values — too long, without spaces, control and
// invisible characters, markup in names, line breaks in one-line fields, only spaces — get an inline error under the
// field before anything is sent, nothing is saved, and the server refuses the same values with the field and the reason.
// Lane `vl`. Steps marked «(after deploy)» read `reasons` from the server, which only the new contracts send.
import { expect, sheet, toastSee } from '../helpers.mjs';

const U = (...c) => String.fromCodePoint(...c);
const RLO = U(0x202E), ZWSP = U(0x200B), BEL = U(0x7);
const ferr = (t, field) => t.page.locator(`[data-field="${field}"] .ferr`).first();
const errText = async (t, field) => (await ferr(t, field).textContent({ timeout: 10000 })).trim();
const has = (text, re, what) => expect(re.test(text), `${what}: got «${text}»`);
const refused = (r, field, reason, what) => {
  expect(r.status === 400 && r.error === 'invalid_input', `${what}: expected invalid_input, got ${r.status} ${JSON.stringify(r).slice(0, 200)}`);
  expect((r.fields || []).includes(field), `${what}: field ${field} not in ${JSON.stringify(r.fields)}`);
  expect(r.reasons?.[field] === reason, `${what}: reason ${reason} expected, got ${JSON.stringify(r.reasons)}`);
};

export default [
 { name: 'profile edit: long word, bidi character, only spaces, too many lines — inline, nothing saved', persona: 'basic', route: '/n/me/edit?only=basics', run: async t => {
   const before = (await t.api('profile.get', { profileId: await t.pid() })).profile;
   const name = '[data-field="name"] input', bio = '[data-field="bio"] textarea';
   await t.see(name);
   await t.fill(name, 'x'.repeat(50)); await t.page.keyboard.press('Tab');
   has(await errText(t, 'name'), /без пробелов/, 'long word');
   await t.fill(name, 'Al' + RLO + 'ex'); await t.page.keyboard.press('Tab');
   has(await errText(t, 'name'), /невидимые/, 'bidi override');
   await t.fill(name, '<b>Alex</b>');
   has(await errText(t, 'name'), /< и >/, 'markup');
   await t.fill(name, '     ');
   has(await errText(t, 'name'), /Заполни/, 'only spaces');
   await t.fill(bio, Array(30).fill('строка').join('\n')); await t.page.keyboard.press('Tab');
   has(await errText(t, 'bio'), /строк/, 'too many lines');
   await t.tap('.ctabar button:has-text("Сохранить")'); await t.wait(1500);
   expect(t.page.url().includes('/edit'), 'stays on the editor');
   expect(await t.page.locator('.field.err').count() >= 2, 'both fields marked');
   const after = (await t.api('profile.get', { profileId: await t.pid() })).profile;
   expect(after.name === before.name && after.bio === before.bio, 'nothing saved');
   // Fixing the value clears the error while typing.
   await t.fill(name, before.name || 'Alex'); await t.wait(300);
   expect(!(await ferr(t, 'name').count()), 'error gone after a fix');
 } },
 { name: 'community create: markup in the name, a run without spaces, an empty rule — inline, nothing sent', persona: 'basic', route: '/n/communities/new', run: async t => {
   let sent = 0; t.page.on('request', r => { if (r.url().includes('/api/fe') && /community\.create/.test(r.postData() || '')) sent++; });
   await t.see('[data-field="name"] input');
   await t.fill('[data-field="name"] input', '<script>x</script>'); await t.page.keyboard.press('Tab');
   has(await errText(t, 'name'), /< и >/, 'markup in the name');
   await t.fill('[data-field="desc"] textarea', 'Описание: ' + 'а'.repeat(100)); await t.page.keyboard.press('Tab');
   has(await errText(t, 'desc'), /без пробелов/, 'long run in the description');
   await t.fill('[data-field="rules"] textarea', '   \n  ');
   await t.tap('.ctabar button'); await t.wait(1200);
   has(await errText(t, 'rules'), /правил/, 'rules required');
   expect(sent === 0, 'nothing sent to the server');
   expect(t.page.url().includes('/communities/new'), 'stays on the form');
 } },
 { name: 'support sheet: only spaces and invisible characters — inline, not sent', persona: 'basic', route: '/n/help', run: async t => {
   const before = (await t.api('support.mine', {})).tickets?.length ?? 0;
   await t.tap('text=Написать в поддержку'); await t.see(sheet + ' >> text=Сообщение');
   await t.fill('#fe-sup-text', '        '); await t.tap(sheet + ' >> text=Отправить');
   has(await errText(t, 'body'), /Заполни/, 'only spaces');
   await t.fill('#fe-sup-text', 'Не приходит' + ZWSP + ' код'); await t.page.keyboard.press('Tab');
   has(await errText(t, 'body'), /невидимые/, 'zero-width space');
   await t.fill('#fe-sup-text', 'abc'); await t.tap(sheet + ' >> text=Отправить');
   await t.see('Напиши хотя бы пару слов');
   await t.page.keyboard.press('Escape');
   const after = (await t.api('support.mine', {})).tickets?.length ?? 0;
   expect(after === before, 'no ticket created');
 } },
 { name: 'chat input: over 2000 characters, a 90-character word — explained, not sent', persona: 'chats', route: '/n/chats', run: async t => {
   const conv = t.me.with.mate.conversationId;
   await t.go(`/n/chats/${conv}`);
   const box = '.inputbar textarea';
   await t.see(box);
   const sendBtn = '.inputbar button[aria-label="Отправить"]:not([disabled])';
   await t.fill(box, 'ab '.repeat(700)); await t.see(sendBtn); await t.page.locator(sendBtn).click();
   await toastSee(t, 'Максимум 2000 символов');
   await t.fill(box, 'смотри ' + 'x'.repeat(90)); await t.see(sendBtn); await t.page.locator(sendBtn).click();
   await toastSee(t, 'без пробелов');
   await t.fill(box, '');
   const msgs = await t.api('chat.messages', { conversationId: conv, limit: 5 });
   expect(!(msgs.items || msgs.messages || []).some(m => (m.body || '').includes('x'.repeat(90))), 'nothing sent');
 } },
 { name: 'server refuses the same values with the field and the reason (after deploy)', persona: 'basic', route: '/n/me', allow4xx: true, run: async t => {
   // Old contracts refuse a line break in an album title too, but without `reasons`: stop before anything could be
   // saved by a server that does not know the new rules yet.
   const probe = await t.api('album.create', { opId: t.uuid7(), title: 'a\nb' });
   if (!probe.reasons) throw new Error('the server does not send `reasons` yet — this step passes only after deploy');
   refused(probe, 'title', 'line_break', 'album title with a line break');
   const p = (await t.api('profile.get', { profileId: await t.pid() })).profile;
   const upd = x => t.api('profile.update', { opId: t.uuid7(), rev: p.rev, ...x });
   try {
   refused(await upd({ name: 'x'.repeat(50) }), 'name', 'long_word', 'profile name without spaces');
   refused(await upd({ name: '<b>Alex</b>' }), 'name', 'markup', 'profile name with markup');
   refused(await upd({ name: 'Al' + RLO + 'ex' }), 'name', 'bad_characters', 'profile name with a bidi override');
   refused(await upd({ name: ' \t ' }), 'name', 'empty', 'profile name of spaces');
   refused(await upd({ bio: Array(30).fill('a').join('\n') }), 'bio', 'too_many_lines', 'bio of 30 lines');
   refused(await upd({ bio: 'x'.repeat(600) }), 'bio', 'too_long', 'bio over 500');
   refused(await t.api('support.create', { opId: t.uuid7(), body: '        ' }), 'body', 'empty', 'support message of spaces');
   refused(await t.api('community.create', { opId: t.uuid7(), name: '<b>Узлы</b>', description: 'Встречи и разговоры о верёвке для новичков', topics: ['shibari'], rules: ['Уважать границы'], privacy: 'open' }),
     'name', 'markup', 'community name with markup');
   const chats = await t.persona('chats');
   refused(await t.api('chat.send', { opId: t.uuid7(), conversationId: chats.with.basic.conversationId, body: 'a' + BEL + 'b' }, chats.email),
     'body', 'bad_characters', 'chat message with a control character');
   // Read back: nothing changed.
   const after = (await t.api('profile.get', { profileId: await t.pid() })).profile;
   expect(after.name === p.name && after.bio === p.bio && after.rev === p.rev, 'profile unchanged');
   } finally {
     // Should a value ever get through, put the profile back.
     const now = (await t.api('profile.get', { profileId: await t.pid() })).profile;
     if (now.rev !== p.rev) await t.api('profile.update', { opId: t.uuid7(), rev: now.rev, name: p.name, bio: p.bio ?? '' });
   }
 } },
];
