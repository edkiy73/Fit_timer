// Couple approvals, stage 3 (docs/notifications.md «Согласования пары и задачи»): one approval sheet for every kind with
// the whole content — a post in full with its audience, a profile change before → after, a club with its rules, the
// question and the answer the hosts get — opened by id from the link; a refusal with a comment and the result card the
// author sees; switching between two ids on the same screen; the restore screen of a paused couple with the approval
// mode that comes back. Every step reads the result back through the API.
// Viewport and theme for the review screenshots: E2E_W=1280 (desktop), E2E_DARK=1 (dark); names carry both.
import { expect, until } from '../helpers.mjs';

const W = Number(process.env.E2E_W || 390);
const viewport = { width: W, height: W > 800 ? 900 : 844 };
const tag = `${W}${process.env.E2E_DARK ? '-dark' : '-light'}`;
const BODY = 'Наконец-то съездили в Вильнюс на тематический фестиваль. Рассказываем, как это было: где жили, что понравилось, что взяли на заметку и куда хотим вернуться в следующем году. ' +
  'Текст длинный нарочно — в согласовании виден весь, без обрезки.';
const ids = /** @type {Record<string, string>} */ ({});
const B = t => t.me.partner?.email;
/** Drops every open change of the couple and turns approvals off for both, so a run starts clean. */
async function clean(t) {
  const cp = t.me.coupleId;
  for (const as of [t.me.email, B(t)]) {
    for (const a of (await t.api('decide.approvals', {}, as, cp)).items ?? []) if (a.mine) await t.api('decide.cancel', { opId: t.uuid7(), approvalId: a.id }, as, cp);
    await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: false }, as, cp);
  }
}

export default [
 { name: 'A proposes three kinds for the couple (B approves A)', persona: 'pair', viewport, run: async t => {
   const cp = t.me.coupleId; expect(cp, 'pair persona has a couple');
   await clean(t);
   await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: true }, B(t), cp);
   const d = await t.api('post.saveDraft', { opId: t.uuid7(), post: { type: 'post', body: BODY, audience: 'followers', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] } }, undefined, cp);
   ids.post = (await t.api('post.publish', { opId: t.uuid7(), postId: d.id }, undefined, cp)).pending?.approvalId;
   const prof = (await t.api('profile.get', { profileId: cp }, undefined, cp)).profile;
   ids.profile = (await t.api('profile.update', { opId: t.uuid7(), rev: prof.rev, bio: 'Мы из Берлина. Любим настолки, долгие прогулки и честные разговоры.' }, undefined, cp)).pending?.approvalId;
   const host = await t.persona('host');
   ids.club = (await t.api('community.join', { opId: t.uuid7(), communityId: host.closedId, rulesAccepted: true, answer: 'Хотим учиться вместе и знакомиться с людьми рядом' }, undefined, cp)).pending?.approvalId;
   expect(ids.post && ids.profile && ids.club, 'three proposals wait: ' + JSON.stringify(ids));
 } },
 { name: 'B opens each by id: the whole post with its audience, before → after, the club with rules and the answer', persona: 'pb', viewport, run: async t => {
   await t.go('/n/me/pair?approval=' + ids.post);
   await t.see('.sheet.on >> text=Разрешить публикацию');
   await t.see('.sheet.on >> text=Текст длинный нарочно');
   await t.see('.sheet.on >> text=Подписчики');
   await t.shot(`ap-post-${tag}`);
   // Another id while one is open: the sheet switches to it.
   await t.go('/n/me/pair?approval=' + ids.profile);
   await t.see('.sheet.on >> text=Принять изменения');
   await t.see('.sheet.on >> text=Любим настолки');
   await t.shot(`ap-profile-${tag}`);
   await t.go('/n/me/pair?approval=' + ids.club);
   await t.see('.sheet.on >> text=Правила');
   await t.see('.sheet.on >> text=Хотим учиться вместе');
   await t.see('.sheet.on >> text=Отправить заявку');
   await t.shot(`ap-club-${tag}`);
 } },
 { name: 'B refuses the post with a comment; A sees the result card with «Изменить и отправить снова»', persona: 'pair', viewport, run: async t => {
   const cp = t.me.coupleId;
   const r = await t.api('decide.approval', { opId: t.uuid7(), approvalId: ids.post, choice: 'reject', comment: 'Давай без названия фестиваля' }, B(t), cp);
   expect(r.state === 'rejected', 'rejected: ' + JSON.stringify(r).slice(0, 200));
   await t.go('/n/me/pair?approval=' + ids.post);
   await t.see('.sheet.on >> text=Отклонено');
   await t.see('.sheet.on >> text=Давай без названия фестиваля');
   await t.see('.sheet.on .sh-f button:has-text("Изменить и отправить снова")');
   expect(!(await t.page.locator('.sheet.on .sh-f button:has-text("Разрешить публикацию")').count()), 'no decision buttons');
   await t.shot(`ap-result-${tag}`);
   const a = (await t.api('approval.get', { id: ids.post })).approval;
   expect(a.state === 'rejected' && a.comment === 'Давай без названия фестиваля', 'read back');
 } },
 { name: 'pause → the restore screen of that couple says which mode comes back → both restore', persona: 'pair', viewport, run: async t => {
   const cp = t.me.coupleId;
   await clean(t);
   await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: true }, t.me.email, cp);
   try {
     const s = await t.api('couple.stop', { opId: t.uuid7(), confirm: true }, B(t), cp);
     expect(s.state === 'paused', 'paused: ' + JSON.stringify(s).slice(0, 200));
     await t.go('/n/me/pair?restore=' + cp);
     await t.see('text=по-прежнему ждут твоего подтверждения');
     await t.see('text=сами не вернутся');
     await t.shot(`ap-restore-${tag}`);
     await t.tap('button:has-text("Согласиться восстановить")');
     await until(async () => (await t.api('couple.get', {}, undefined, cp)).couple.members.find(m => m.me)?.restoreAgreed, 'agreed', 20000);
   } finally {
     for (const as of [t.me.email, B(t)]) await t.api('couple.restore', { opId: t.uuid7() }, as, cp);
     const c = (await t.api('couple.get', {}, undefined, cp)).couple;
     expect(c.state === 'active', 'restored: ' + c.state);
     expect(c.members.find(m => m.me)?.approvesPartner === true, 'the mode came back');
     await clean(t);
   }
 } },
];
