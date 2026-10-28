// Leftovers and owner decisions (28.10.2026): «Как подбираем» says what «Популярное» does, «Обсуждают в сообществах»
// respects a host's «Не показывать в Популярном», an event draft is continued at its step, the mention picker marks
// people who take no mention, «Следить за статьями» shows the real state, the gallery's selection mode hides the
// dock, the link editor asks before leaving with unsaved changes. Lane `lo`. Everything made here is removed.
// Server-dependent (need the deploy of this branch): event.draftGet, `mentionable`.
import { expect, until, toastSee, sheet, dialog } from '../helpers.mjs';
import { STAFF, staff } from '../../personas.mjs';
import { uploadFixture } from '../../lib.mjs';

const tag = () => 'lo-' + Date.now().toString(36);
const ok = (r, what) => { if (r.status && r.status >= 400) throw new Error(`${what}: ${r.status} ${JSON.stringify(r).slice(0, 200)}`); return r; };

export default [
 { name: '«Как подбираем» explains discussed-over-liked and 7 days; the communities block follows a host\'s «не в Популярном»', persona: 'full', run: async t => {
   const H = await t.persona('host'); const mark = tag();
   const d = ok(await t.api('post.saveDraft', { opId: t.uuid7(), post: { type: 'post', body: `Обсуждение ${mark}`, communityId: H.openId } }, H.email), 'discussion');
   ok(await t.api('post.publish', { opId: t.uuid7(), postId: d.id }, H.email), 'publish');
   try {
     // Someone replies, so it has something to rank by.
     await t.api('community.join', { opId: t.uuid7(), communityId: H.openId, rulesAccepted: true }).catch(() => {});
     ok(await t.api('reply.create', { opId: t.uuid7(), postId: d.id, body: 'Интересно ' + mark }), 'reply');
     await t.go('/n/feed');
     await t.tap('[role="tab"]:has-text("Популярное")');
     await t.tap('button:has-text("Как подбираем")');
     await t.see(`${sheet}:has-text("Обсуждаемое, а не громкое")`); await t.see(`${sheet}:has-text("Окно — 7 дней")`);
     await t.see(`${sheet}:has-text("Хозяева могут не показывать")`);
     await t.page.keyboard.press('Escape'); await t.wait(400);
     // The block shows what the server ranks (top 3 the viewer may read).
     const top = (await t.api('discussions.popular', { limit: 3 })).items ?? [];
     if (top.length) {
       await t.see(`.grp:has-text("Обсуждают в сообществах") .li:has-text("${top[0].title || top[0].excerpt.slice(0, 20)}")`);
       expect(await t.page.locator('.grp:has-text("Обсуждают в сообществах") .li').count() === top.length, 'as many rows as the server gives');
     }
     const mineShown = top.some(x => x.id === d.id);
     // The host keeps it out: gone from the server's list and from the block after a reload.
     ok(await t.api('discussion.host', { opId: t.uuid7(), postId: d.id, change: 'excludePopular' }, H.email), 'excludePopular');
     const after = (await t.api('discussions.popular', { limit: 3 })).items ?? [];
     expect(!after.some(x => x.id === d.id), 'kept out on the server');
     await t.page.reload(); await t.tap('[role="tab"]:has-text("Популярное")'); await t.wait(1500);
     if (mineShown) await t.notSee(`.li:has-text("Обсуждение ${mark}")`, 3000);
   } finally {
     await t.api('post.delete', { opId: t.uuid7(), postId: d.id }, H.email).catch(() => {});
     await t.api('community.leave', { opId: t.uuid7(), communityId: H.openId }).catch(() => {});
   }
 } },

 { name: 'event draft: «Продолжить» opens the editor at the saved step with the saved form [needs deploy: event.draftGet]', persona: 'full', run: async t => {
   const title = 'Черновик ' + tag();
   const s = ok(await t.api('event.draftSave', { opId: t.uuid7(), step: 3, form: { title, kind: 'talk', description: 'Описание черновика для проверки', format: 'online', joinUrl: 'https://meet.example/lo' } }), 'draftSave');
   try {
     await t.go('/n/me?layer=mine&part=events');
     await t.tap(`.li:has-text("${title}") button:has-text("Продолжить")`);
     await t.see('.stepper:has-text("3/4")');
     expect(t.page.url().includes('draft=' + s.id), 'the draft is in the address');
     await t.tap('.bar button[aria-label="Назад"]');
     await t.see('.stepper:has-text("2/4")'); await t.see('input[value="https://meet.example/lo"]');
     await t.tap('.bar button[aria-label="Назад"]'); await t.see('.stepper:has-text("1/4")');
     expect(await t.page.locator(`input[value="${title}"]`).count() === 1, 'title filled from the draft');
   } finally { await t.api('event.draftDelete', { opId: t.uuid7(), draftId: s.id }).catch(() => {}); }
 } },

 { name: 'mention picker: someone who takes no mentions is marked «без уведомления» [needs deploy: mentionable]', persona: 'full', run: async t => {
   const B = await t.persona('basic');
   ok(await t.api('profile.setVisibility', { opId: t.uuid7(), setting: 'mentionsFrom', value: 'none' }, B.email), 'mentionsFrom none');
   try {
     const found = (await t.api('people.search', { q: B.handle })).items.find(x => x.id === B.personId);
     expect(found && found.mentionable === false, 'server says not mentionable: ' + JSON.stringify(found ?? null).slice(0, 120));
     await t.go('/n/feed/new');
     await t.tap('button:has-text("Упомянуть")'); await t.fill(`${sheet} input[type="search"]`, B.handle);
     await t.see(`${sheet} .li:has-text("@${B.handle} · без уведомления")`);
     await t.tap(`${sheet} .li:has-text("@${B.handle}")`);
     await toastSee(t, 'имя останется текстом');
   } finally { await t.api('profile.setVisibility', { opId: t.uuid7(), setting: 'mentionsFrom', value: 'all' }, B.email).catch(() => {}); }
 } },

 { name: 'gallery: the selection mode hides the dock, «Готово» brings it back', persona: 'full', run: async t => {
   let made = null;
   const have = (await t.api('gallery.list', { profileId: t.me.personId })).items ?? [];
   if (!have.length) {
     await staff();
     const asset = await uploadFixture(t.me.email, 'post');
     for (let k = 0; k < 20; k++) {
       const r = await t.api('staff.mediaDecide', { opId: t.uuid7(), assetId: asset, decision: 'approve', explicit: false }, STAFF);
       if (r.status === 200) break;
       await t.wait(3000);
     }
     const d = ok(await t.api('post.saveDraft', { opId: t.uuid7(), post: { type: 'post', body: 'lo gallery', audience: 'all', inFeed: false, mediaIds: [asset] } }), 'saveDraft');
     ok(await t.api('post.publish', { opId: t.uuid7(), postId: d.id }), 'publish'); made = d.id;
     await until(async () => ((await t.api('gallery.list', { profileId: t.me.personId })).items ?? []).length > 0, 'a tile');
   }
   try {
     await t.go(`/n/people/${t.me.personId}/gallery`); await t.see('.ggrid');
     expect(await t.page.locator('nav.dock').count() === 1, 'dock before');
     await t.tap('.bar button:has-text("Выбрать")'); await t.see('.sel-bar');
     expect(await t.page.locator('nav.dock').count() === 0, 'no dock while selecting');
     await t.tap('.bar button:has-text("Готово")'); await t.notSee('.sel-bar', 3000);
     expect(await t.page.locator('nav.dock').count() === 1, 'dock back');
   } finally { if (made) await t.api('post.delete', { opId: t.uuid7(), postId: made }).catch(() => {}); }
 } },

 { name: 'link editor: leaving with a changed kind asks «Выйти без сохранения?»; untouched leaves at once', persona: 'full', run: async t => {
   const B = await t.persona('basic');
   await t.go('/n/people/' + B.personId);
   await t.go('/n/people/' + B.personId + '/link');
   await t.see('[role="radiogroup"]');
   await t.tap('.bar button[aria-label="Назад"]');
   await until(async () => !t.page.url().endsWith('/link'), 'untouched form leaves at once', 5000);
   await t.go('/n/people/' + B.personId + '/link'); await t.see('[role="radiogroup"]');
   const other = t.page.locator('[role="radio"][aria-checked="false"]').first(); await other.click();
   await t.tap('.bar button[aria-label="Назад"]');
   await t.see(`${dialog}:has-text("Выйти без сохранения?")`);
   await t.tap(`${dialog} button:has-text("Остаться")`); await t.wait(300);
   expect(t.page.url().endsWith('/link'), 'stayed');
   await t.tap('.bar button[aria-label="Назад"]'); await t.tap(`${dialog} button:has-text("Выйти")`);
   await until(async () => !t.page.url().endsWith('/link'), 'left after «Выйти»', 5000);
   const links = await t.api('links.mine', {});
   expect(![...(links.sent ?? []), ...(links.confirmed ?? [])].some(l => l.other?.id === B.personId), 'nothing was sent');
 } },
];
