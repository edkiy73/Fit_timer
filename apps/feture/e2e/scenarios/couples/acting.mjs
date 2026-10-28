// Acting identity without an author picker (owner rule: no «от кого / я или мы» menu anywhere): acting as the couple,
// every place one writes from shows it — the couple's avatar / plate on the feed's «Что нового», the reply box and the
// community composer, «…от пары» on buttons and in placeholders; acting as oneself, the plain wording comes back.
// The acting profile is read back from session.bootstrap.
import { expect } from '../helpers.mjs';

const actAs = (t, id) => t.page.addInitScript(v => { try { sessionStorage.setItem('feture.fe.acting', v); } catch { /* none */ } }, id);
const noPicker = async t => {
  for (const s of ['text=От кого', 'text=Я или мы', 'text=От себя', '[aria-label="От кого"]'])
    expect(!(await t.page.locator(s).count()), 'an author picker is on screen: ' + s);
};

export default [
 { name: 'as the couple: «Что нового у вас?» with the couple avatar, editor «Опубликовать от пары», reply «Ответить от пары…», no picker', persona: 'pair', run: async t => {
   const b = await t.boot(); const couple = b.profiles.find(p => p.kind === 'couple' && p.state === 'active');
   expect(couple && couple.id === t.me.coupleId, 'bootstrap has the couple: ' + JSON.stringify(b.profiles?.map(p => p.kind)));
   await actAs(t, couple.id);
   await t.go('/n/feed');
   await t.see('.composer .cmp-main:has-text("Что нового у вас?")');
   // The couple's picture, or both initials on the couple plate.
   const av = t.page.locator('.composer .cmp-main .av').first();
   expect(await av.count() && (couple.avatar ? await av.locator('img').count() : await av.evaluate(el => el.classList.contains('split'))), 'composer avatar is not the couple');
   await noPicker(t);
   // The editor.
   await t.tap('.composer .cmp-main'); await t.see('.compose .rte-ed[data-ph="О чём хотите рассказать?"]');
   await t.see('.cmp-who:has-text("От пары")'); await t.see('.ctabar button:has-text("Опубликовать от пары"), .compose ~ * button:has-text("Опубликовать от пары"), button:has-text("Опубликовать от пары")');
   await noPicker(t);
   // A reply box under a post the couple can see.
   const post = (await t.api('feed.list', { tab: 'forYou', limit: 5 }, undefined, couple.id)).items?.find(x => x.id && x.type);
   expect(post, 'the couple sees a post in «Для тебя»');
   await t.go('/n/feed/post/' + post.id);
   await t.see('.inputbar textarea[placeholder="Ответить от пары…"]');
   await t.see('.inputbar button[aria-label="Отправить от пары"]');
   const rav = t.page.locator('.inputbar > .av').first();
   expect(await rav.count() && (couple.avatar ? await rav.locator('img').count() : await rav.evaluate(el => el.classList.contains('split'))), 'reply box avatar is not the couple');
   await noPicker(t);
   await t.shot('couple-acting-reply');
 } },
 { name: 'as the couple: community composer and link request say «от пары»; chat input too when the couple has a chat', persona: 'pair', run: async t => {
   const couple = (await t.boot()).profiles.find(p => p.kind === 'couple' && p.state === 'active');
   await actAs(t, couple.id);
   // A link to another person of the lane: the send button speaks for the couple.
   const mate = await t.persona('mate');
   await t.go('/n/people/' + mate.personId + '/link');
   const linkBtn = t.page.locator('.ctabar button').first(); await linkBtn.waitFor({ state: 'visible', timeout: 30000 });
   const label = (await linkBtn.innerText()).trim();
   expect(/от пары|Готово|Обновить|Сохранить|Мои связи/.test(label), 'link button: ' + label);
   // A community the couple belongs to, if any: its «Новая тема» entry.
   const cm = await t.api('community.mine', {}, undefined, couple.id).catch(() => ({}));
   const c = [...(cm.hosting ?? []), ...(cm.member ?? [])].find(x => (x.state ?? 'published') === 'published');
   if (c) { await t.go('/n/communities/' + c.id); await t.see('.view .composer .cmp-main:has-text("Тема от пары")'); await t.see('.view .composer .cmp-main .av'); }
   else console.log('   the couple is in no community — community composer not checked');
   const chats = ((await t.api('chats.list', { filter: 'couple' }).catch(() => ({}))).items ?? []).filter(x => x.side?.id === couple.id && x.state !== 'ended');
   if (chats[0]?.id) { await t.go('/n/chats/' + chats[0].id); await t.see('.inputbar textarea[placeholder="Сообщение от пары"]'); await t.see('.inputbar > .av'); }
   else console.log('   the couple has no chat — chat input not checked');
   await noPicker(t);
 } },
 { name: 'as oneself: plain wording, own avatar, no couple words', persona: 'pair', run: async t => {
   const me = (await t.boot()).profiles.find(p => p.kind === 'person');
   await actAs(t, me.id);
   await t.go('/n/feed');
   await t.see('.composer .cmp-main:has-text("Что нового?")');
   expect(!(await t.page.locator('.composer .cmp-main .av.split').count()), 'person composer shows the couple plate');
   const post = (await t.api('feed.list', { tab: 'forYou', limit: 5 })).items?.[0];
   await t.go('/n/feed/post/' + post.id);
   await t.see('.inputbar textarea[placeholder="Ответить…"]');
   await t.see('.inputbar button[aria-label="Отправить"]');
   await noPicker(t);
 } },
];
