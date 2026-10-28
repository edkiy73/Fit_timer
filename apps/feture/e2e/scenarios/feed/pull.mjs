// Pull-to-refresh and «Новые публикации ↑» (owner 29.10.2026), on a touch phone: another persona publishes while the
// reader looks at the feed; a pull at the top shows it, a pull lower down only scrolls, a revisit lights the pill and
// its tap scrolls up and shows the new post. The list never changes under the reader without a pull or the tap.
import { expect, until, pullDown, stamp } from '../helpers.mjs';

const publish = async (t, who, body) => {
  const d = await t.api('post.saveDraft', { opId: t.uuid7(), post: { type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] } }, who.email);
  await t.api('post.publish', { opId: t.uuid7(), postId: d.id }, who.email);
  return d.id;
};
const reads = t => { const got = []; t.page.on('request', r => { if (r.url().includes('/api/fe')) { try { got.push(JSON.parse(r.postData() || '{}').action); } catch { /* not json */ } } }); return got; };
const top = t => t.page.evaluate(() => document.querySelector('.main>.view').scrollTop);
const post = (t, body) => t.page.locator('.posts article.post', { hasText: body });

export default [
 { name: 'pull at the top: the mark follows, release reads past the cache and shows a post published meanwhile', persona: 'full', touch: true, route: '/n/feed', run: async t => {
   await t.see('.posts article.post'); await t.wait(1500);
   const other = await t.persona('stranger'); const body = 'e2e pull ' + stamp(); let id;
   try {
     id = await publish(t, other, body);
     await t.wait(1500); expect(!(await post(t, body).count()), 'the new post appeared without a pull');
     const sent = reads(t);
     await pullDown(t, { from: 300, to: 560, mid: async () => {
       await t.page.locator('.k-pull').waitFor({ state: 'visible', timeout: 3000 });
       expect(await t.page.locator('.k-pull.ready').count(), 'the mark did not reach the threshold');
       expect(await top(t) === 0, 'the list moved during the pull');
       await t.shot('pull-mid');
     } });
     await t.page.locator('.k-pull.busy').waitFor({ state: 'visible', timeout: 3000 });
     await t.shot('pull-busy');
     await post(t, body).first().waitFor({ state: 'visible', timeout: 20000 });
     expect(sent.includes('feed.list'), 'no feed.list request after the pull: ' + sent.join(','));
     await until(async () => !(await t.page.locator('.k-pull').count()), 'the mark did not go away', 8000);
     expect(await top(t) === 0, 'scroll moved after the refresh');
   } finally { if (id) await t.api('post.delete', { opId: t.uuid7(), postId: id }, other.email); }
 } },
 { name: 'pull lower down only scrolls: no mark, no refresh', persona: 'full', touch: true, route: '/n/feed', run: async t => {
   await t.see('.posts article.post'); await t.wait(1500);
   await t.page.evaluate(() => document.querySelector('.main>.view').scrollTo(0, 900)); await t.wait(400);
   const before = await top(t); expect(before > 300, 'could not scroll the feed: ' + before);
   const sent = reads(t);
   await pullDown(t, { from: 300, to: 420, mid: async () => { expect(!(await t.page.locator('.k-pull').count()), 'mark shown while not at the top'); } });
   await t.wait(1500);
   expect(!sent.includes('feed.list'), 'the feed was read again: ' + sent.join(','));
   const after = await top(t); expect(after > 0 && after < before, `the finger should scroll the list: ${before} → ${after}`);
 } },
 { name: '«Новые публикации ↑»: a revisit lights it, nothing is inserted above the reader, the tap scrolls up and shows the post', persona: 'full', touch: true, route: '/n/feed', run: async t => {
   await t.see('.posts article.post'); await t.wait(1500);
   const other = await t.persona('stranger'); const body = 'e2e pill ' + stamp(); let id;
   try {
     await t.go('/n/communities'); await t.wait(1200);
     id = await publish(t, other, body);
     await t.go('/n/feed'); await t.see('.posts article.post');
     await t.page.locator('.k-newpill button').waitFor({ state: 'visible', timeout: 20000 });
     expect(!(await post(t, body).count()), 'the new post was put in the list without the tap');
     await t.page.evaluate(() => document.querySelector('.main>.view').scrollTo(0, 700)); await t.wait(600);
     const y = await top(t);
     expect(await t.page.locator('.k-newpill button').isVisible(), 'the pill does not stay on screen while scrolled');
     await t.shot('pill');
     await t.wait(1500); expect(await top(t) === y, 'the list moved under the reader');
     await t.page.locator('.k-newpill button').click();
     await post(t, body).first().waitFor({ state: 'visible', timeout: 20000 });
     await until(async () => (await top(t)) === 0, 'the tap did not scroll to the top', 5000);
     expect(!(await t.page.locator('.k-newpill').count()), 'the pill stayed after the tap');
   } finally { if (id) await t.api('post.delete', { opId: t.uuid7(), postId: id }, other.email); }
 } },
];
