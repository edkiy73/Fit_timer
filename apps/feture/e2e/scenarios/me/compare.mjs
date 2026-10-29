// Someone else's interest (V21 «topic» sheet, openTopic; owner 28.10.2026 compact): a tap on their capsule opens one
// comparison bar (both avatars, both answers, the interest) with one verdict under it, «Добавить себе» / «Изменить мой»
// and «Об этом интересе». No «Ответ X» / «Твой ответ» blocks or headings; my non-public answer is a key on my avatar. Only what interests.list lets the viewer
// see is shown: an «only» interest never appears, a hard limit is a boundary without level and never a match.
import { expect, until } from '../helpers.mjs';

const list = async (t, profileId, as) => (await t.api('interests.list', { profileId }, as)).items ?? [];
const names = async t => new Map(((await t.api('catalog.get', {})).topics ?? []).map(x => [x.id, x.ru]));

export default [
 { name: 'their capsule → sheet: their answer, mine, comparison; hard limit = boundary; «only» stays hidden; «Изменить мой» edits mine', persona: 'full', run: async t => {
   const mate = await t.persona('mate'); const me = await t.pid();
   const topic = await names(t);
   const mineBefore = await list(t, me); const mateBefore = await list(t, mate.personId, mate.email);
   const restore = [];
   try {
     // Mate: a hard limit on a topic where I have a level, and a private («only») interest I must never see.
     // Two topics neither has: on the first I get a level (removed afterwards), mate a public hard limit.
     const free = [...topic.keys()].filter(id => !mateBefore.some(m => m.topicId === id) && !mineBefore.some(m => m.topicId === id));
     expect(free.length >= 3, 'three topics neither person has');
     const mineLevel = { topicId: free[0], value: 6 }; const hidden = free[1];
     restore.push(mineLevel.topicId, hidden, 'mine:' + mineLevel.topicId);
     await t.api('interests.set', { opId: t.uuid7(), topicId: mineLevel.topicId, value: 6, dir: ['give', 'get', 'watch'], vis: 'only' });
     await t.api('interests.set', { opId: t.uuid7(), topicId: mineLevel.topicId, mark: 'hard', vis: 'public' }, mate.email);
     await t.api('interests.set', { opId: t.uuid7(), topicId: hidden, value: 9, dir: ['give'], vis: 'only' }, mate.email);
     // A public level of mate's I lack (made on a third free topic when there is none).
     if (!mateBefore.some(j => j.value != null && j.vis === 'public' && !mineBefore.some(m => m.topicId === j.topicId))) {
       restore.push(free[2]);
       await t.api('interests.set', { opId: t.uuid7(), topicId: free[2], value: 5, dir: ['give'], vis: 'public' }, mate.email);
     }
     const seen = await list(t, mate.personId);
     expect(seen.find(j => j.topicId === mineLevel.topicId)?.mark === 'hard' && seen.find(j => j.topicId === mineLevel.topicId)?.value == null, 'server sends their limit without a level');
     expect(!seen.some(j => j.topicId === hidden), 'server leaked an «only» interest');

     await t.go('/n/people/' + mate.personId);
     await t.see('.profile-page .jars .sc');
     expect(!(await t.page.locator(`.profile-page .sc:has-text("${topic.get(hidden)}")`).count()), '«only» interest shown on the profile');
     // More than six capsules fold behind «Ещё N».
     const more = t.page.locator('.profile-page .sc.more'); if (await more.count()) await more.first().click();
     const limitName = topic.get(mineLevel.topicId);
     await t.tap(`.profile-page .sc:has-text("${limitName}")`);
     await t.see(`.sheet.on h2:has-text("${limitName}")`);
     const mateName = (await t.api('profile.get', { profileId: mate.personId })).profile?.name || mate.handle;
     expect(!(await t.page.locator(`.sheet.on :text("Ответ ${mateName}"), .sheet.on :text("Твой ответ"), .sheet.on .sec, .sheet.on .alert`).count()), 'old answer blocks / headings / boxes');
     // One bar: my 6 with my roles on the left, their limit as a word (no number) on the right; a key on my avatar.
     const bar = t.page.locator('.sheet.on .cmpx .cr');
     expect(await bar.count() === 1, 'one comparison bar');
     expect((await bar.locator('.cr-v').first().innerText()).includes(String(mineLevel.value)), 'my level in the bar');
     const theirSide = bar.locator('.cr-v.r');
     expect((await theirSide.innerText()).includes('табу') && !/\d/.test(await theirSide.innerText()), 'their limit drawn as a level');
     expect(await bar.locator('.cr-av.me .cr-key').count() === 1, 'no key on my avatar for an «only» answer');
     expect(await bar.locator('.cr-av.them .av').count() === 1, 'their avatar');
     // The verdict is «Границы», never «Совпадает».
     await t.see('.sheet.on .cmpx-verdict:has-text("Границы")'); await t.shot('me-compare-limit');
     await t.see(`.sheet.on .cmpx-verdict:has-text("Для ${mateName} это граница")`);
     expect(!(await t.page.locator('.sheet.on :text("Совпадает")').count()), 'a limit shown as a match');
     // «Изменить мой» opens my own interest sheet with my answer.
     await t.tap('.sheet.on .sh-f button:has-text("Изменить мой")');
     await t.see('.sheet.on .ans-scale');
     await t.see(`.sheet.on .ans-scale button[aria-pressed="true"]:has-text("${mineLevel.value}"), .sheet.on .ans-word:has-text("${mineLevel.value}")`);
     await t.tap('.sheet.on .sh-h button'); await t.see(`.sheet.on h2:has-text("${limitName}")`);
     await t.tap('.sheet.on .sh-h button');

     // A public level of theirs I don't have: «Добавить себе», and adding it compares.
     const theirsOnly = seen.find(j => j.value != null && j.topicId !== mineLevel.topicId && !mineBefore.some(m => m.topicId === j.topicId));
     if (theirsOnly) {
       const n = topic.get(theirsOnly.topicId);
       await t.tap(`.profile-page .sc:has-text("${n}")`); await t.see(`.sheet.on h2:has-text("${n}")`);
       expect(!(await t.page.locator('.sheet.on .k-verdict').count()), 'no verdict line when I don\'t have the interest (the button says it)');
       await t.see('.sheet.on .sh-f button:has-text("Об этом интересе")');
       await t.tap('.sheet.on .sh-f button:has-text("Добавить себе")');
       await t.tap('.sheet.on .ans-scale button:has-text("7")'); await t.tap('.sheet.on .sh-f .btn.primary');
       restore.push('mine:' + theirsOnly.topicId);
       await until(async () => (await list(t, me)).find(j => j.topicId === theirsOnly.topicId)?.value === 7, 'my answer saved');
       await t.see('.sheet.on .cmpx-verdict');
       await t.see('.sheet.on .sh-f button:has-text("Изменить мой")');
     } else console.log('   mate has no public level I lack — «Добавить себе» not exercised');
     await t.shot('me-compare');
   } finally {
     for (const r of restore) {
       if (!r) continue;
       if (r.startsWith('mine:')) { await t.api('interests.remove', { opId: t.uuid7(), topicId: r.slice(5) }); continue; }
       const was = mateBefore.find(m => m.topicId === r);
       if (was) await t.api('interests.set', { opId: t.uuid7(), topicId: r, vis: was.vis, ...(was.mark ? { mark: was.mark } : { value: was.value, dir: was.dir }) }, mate.email);
       else await t.api('interests.remove', { opId: t.uuid7(), topicId: r }, mate.email);
     }
   }
 } },
];
