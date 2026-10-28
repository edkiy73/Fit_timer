// Video (owner, 28.10.2026): the composer and the chat attach sheet take a clip (≤ 1 min, ≤ 100 MB), the uploader shows
// it with its length and poster (no crop), it uploads with the poster, and the post / chat message reads back as kind
// video. Clips always go to staff review (no classifier judges moving pictures); STAFF approves, then the card shows the
// poster with ▶ and the viewer plays it. Clean-up deletes the post.
import { STAFF } from '../../personas.mjs';
import { expect, until } from '../helpers.mjs';

/** A two-second WebM recorded from a canvas in the page (Chromium's MediaRecorder), as a Buffer. */
async function clip(t) {
  const b64 = await t.page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 568; const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(24), { mimeType: 'video/webm' }); const parts = [];
    rec.ondataavailable = e => parts.push(e.data);
    let f = 0; const iv = setInterval(() => { g.fillStyle = `hsl(${f * 9},70%,50%)`; g.fillRect(0, 0, 320, 568); g.fillStyle = '#fff'; g.font = '700 40px sans-serif'; g.fillText('e2e ' + f++, 30, 80); }, 40);
    rec.start(200); await new Promise(r => setTimeout(r, 2200)); rec.stop(); clearInterval(iv); await new Promise(r => { rec.onstop = r; });
    const buf = new Uint8Array(await new Blob(parts, { type: 'video/webm' }).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s);
  });
  return Buffer.from(b64, 'base64');
}
const mine = async t => (await t.api('me.posts', {})).items ?? [];

export default [
  { name: 'video post: pick a clip → uploader row with length, no crop → publish → kind video; staff approves → ▶ on the card, the viewer plays', persona: 'full', route: '/n/feed/new', run: async t => {
    let id;
    try {
      await t.see('.compose .rte-ed');
      const bytes = await clip(t);
      const [ch] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.locator('.attach button').first().click()]);
      await ch.setFiles([{ name: 'clip.webm', mimeType: 'video/webm', buffer: bytes }]);
      await t.see('.sheet.on .k-uprow:has-text("Видео · 0:02")', 20000);
      await t.see('.sheet.on .k-uprow .k-vbadge');
      expect(!(await t.page.locator('.sheet.on .k-uprow button:has-text("Кадрировать")').count()), 'a clip is never cropped');
      await t.shot('video-uploader');
      await t.tap('.sheet.on .sh-f button:has-text("Готово")');
      await t.see('.edit-ph .k-vbadge', 60000);
      const body = 'e2e видео ' + Math.random().toString(36).slice(2, 7); await t.fill('.compose .rte-ed', body); await t.tap('.ctabar .btn.primary');
      const p = await until(async () => (await mine(t)).find(x => x.body === body), 'post saved', 30000); id = p.id;
      expect(p.media.length === 1 && p.media[0].kind === 'video', 'kind ' + p.media[0]?.kind);
      expect(p.media[0].durationMs >= 1500 && p.media[0].durationMs <= 4000, 'length ' + p.media[0].durationMs);
      // The scan sends every clip to staff; approve it as STAFF, then the post goes out.
      const asset = p.media[0].id;
      const ok = await until(async () => (await t.api('staff.mediaDecide', { opId: t.uuid7(), assetId: asset, decision: 'approve', explicit: false }, STAFF)).status === 200 || null,
        'staff approved the clip', 180000);
      expect(ok, 'approved');
      const out = await until(async () => (await mine(t)).find(x => x.id === id && x.state === 'published' && x.media[0]?.src?.file), 'published with a playable clip', 120000);
      await t.go('/n/feed/post/' + out.id);
      await t.see('.mgrid .k-vbadge', 30000);
      await t.tap('.mgrid .mcell');
      await t.see('.viewer .vw-track video', 15000);
      await t.shot('video-viewer');
    } finally { if (id) await t.api('post.delete', { opId: t.uuid7(), postId: id }); }
  } },
  { name: 'video in chat: attach sheet «Видео» → send sheet with poster and length → the partner reads back kind video', persona: 'chats', run: async t => {
    const c = t.me; const conv = c.with.mate.conversationId; const mate = c.with.mate.email;
    await t.go('/n/chats/' + conv); await t.see('.msgs .msg.sys', 30000);
    const bytes = await clip(t);
    await t.tap('button[aria-label="Вложение"]');
    await t.see('.sheet.on:has-text("Фото или видео")');
    const [ch] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.locator('.sheet.on .li:has-text("Видео")').click()]);
    await ch.setFiles([{ name: 'clip.webm', mimeType: 'video/webm', buffer: bytes }]);
    await t.see('.sheet.on:has-text("Отправить: видео")', 20000);
    await t.see('.sheet.on .cm-prev .k-vbadge');
    await t.shot('video-chat-send');
    await t.tap('.sheet.on .sh-f button:has-text("Отправить")');
    const got = await until(async () => {
      const m = ((await t.api('chat.messages', { conversationId: conv }, mate)).items ?? []).at(-1);
      return m && !m.mine && m.media?.kind === 'video' ? m : null;
    }, 'the partner has a video message', 90000);
    expect(got.media.src?.file === undefined, 'no clip link before review / while covered');
  } },
];
