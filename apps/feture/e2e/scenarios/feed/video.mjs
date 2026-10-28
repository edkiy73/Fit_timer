// Video (owner, 28.10.2026): the composer and the chat attach sheet take a clip (≤ 1 min, ≤ 100 MB), the uploader shows
// it with its length and poster, trims and crops it (stored with the clip, honoured by the players), it uploads with the poster, and the post / chat message reads back as kind
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
  { name: 'video post: pick a clip → square preview at 1:1, trim (handles) and crop → the intent carries them → the preview plays only the part, in its frame, with controls → publish; staff approves → inline player and the viewer play it with controls', persona: 'full', route: '/n/feed/new', run: async t => {
    let id; const sent = [];
    // The edit goes with the upload intent. A production server older than this build refuses the unknown field: the
    // request is then repeated without it (the rest of the flow still runs) and the stored-edit checks are skipped.
    let legacy = false;
    await t.page.route('**/api/fe', async r => {
      const body = JSON.parse(r.request().postData() || '{}');
      if (body.action !== 'media.uploadIntent' || body.kind !== 'video') return r.fallback();
      sent.push(body);
      const prod = (process.env.FE_API || 'https://feture-mvp.vercel.app') + '/api/fe';
      const go = b => r.fetch({ url: prod, postData: JSON.stringify(b), headers: { ...r.request().headers(), origin: new URL(prod).origin, referer: new URL(prod).origin + '/' } });
      let res = await go(body);
      if (res.status() === 400 && body.edit) { legacy = true; const { edit: _e, ...rest } = body; res = await go(rest); }
      await r.fulfill({ response: res });
    });
    try {
      await t.see('.compose .rte-ed');
      const bytes = await clip(t);
      const [ch] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.locator('.attach button').first().click()]);
      await ch.setFiles([{ name: 'clip.webm', mimeType: 'video/webm', buffer: bytes }]);
      await t.see('.sheet.on .k-uprow:has-text("Видео · 0:02")', 20000);
      await t.see('.sheet.on .k-uprow .k-vbadge');
      // The preview follows the format: 1:1 → square; the actions sit on one line on the text's left edge.
      await t.tap('.sheet.on .seg button:has-text("1:1")'); await t.wait(1500);
      const th = await t.page.locator('.sheet.on .k-upthumb').first().boundingBox();
      expect(Math.abs(th.width - th.height) < 2, 'square preview at 1:1: ' + th.width + 'x' + th.height);
      const name = await t.page.locator('.sheet.on .k-uptx b').first().boundingBox();
      const acts = await t.page.locator('.sheet.on .k-upacts .btn').evaluateAll(l => l.map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), b.textContent.trim()]; }));
      expect(acts.map(a => a[2]).join(',') === 'Обрезать,Кадрировать', 'actions ' + acts.map(a => a[2]));
      await t.see('.sheet.on .k-uphead button[aria-label="Убрать"]');
      expect(Math.abs(acts[0][0] - name.x) <= 1 && acts.every(a => a[1] === acts[0][1]), 'actions on one line at the text edge ' + JSON.stringify(acts) + ' name ' + name.x);
      const gap = await t.page.evaluate(() => { const a = document.querySelector('.sheet.on .alert'); const b = document.querySelector('.sheet.on .sh-b > .btn'); return a.getBoundingClientRect().top - b.getBoundingClientRect().bottom; });
      expect(gap >= 10, 'the note is not glued to «Добавить ещё»: ' + gap);
      await t.shot('video-uploader');
      // Trim: the handles move by 0.1 s with the arrows.
      await t.tap('.sheet.on .k-upacts button:has-text("Обрезать")');
      await t.see('.sheet.on .k-trim-strip'); await t.wait(1200);
      await t.page.locator('.k-trim-h.l').focus(); for (let i = 0; i < 5; i++) await t.page.keyboard.press('ArrowRight');
      await t.page.locator('.k-trim-h.r').focus(); for (let i = 0; i < 5; i++) await t.page.keyboard.press('ArrowLeft');
      await t.shot('video-trim');
      await t.tap('.sheet.on .sh-f button:has-text("Применить")');
      await t.see('.sheet.on .k-uprow:has-text("из 0:02")', 15000);
      // Crop: the same sheet as photos, the clip's frame at the trim start.
      await t.tap('.sheet.on .k-upacts button:has-text("Кадрировать")'); await t.see('.k-crop img');
      const b = await t.page.locator('.k-crop').boundingBox(); expect(Math.abs(b.width / b.height - 1) < .02, 'frame 1:1');
      await t.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await t.page.mouse.down(); await t.page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2, { steps: 5 }); await t.page.mouse.up();
      await t.page.locator('.k-crop-zoom input').fill('1.5'); await t.shot('video-crop');
      await t.tap('.sheet.on .sh-f button:has-text("Применить")'); await t.see('.sheet.on .k-uprow:has-text("из 0:02")', 15000);
      await t.tap('.sheet.on .sh-f button:has-text("Готово")');
      await t.see('.edit-ph .k-vbadge', 60000);
      const e = sent.at(-1)?.edit;
      expect(e && e.trim && e.trim.startMs === 500 && e.trim.endMs > e.trim.startMs + 1000 - 1 && e.crop?.aspect === '1:1' && e.crop.z === 1.5, 'edit sent ' + JSON.stringify(e));
      const tile = await t.page.locator('.edit-ph > div').first().boundingBox();
      expect(Math.abs(tile.width - tile.height) < 2, 'composer tile square ' + tile.width + 'x' + tile.height);
      const body = 'e2e видео ' + Math.random().toString(36).slice(2, 7); await t.fill('.compose .rte-ed', body);
      // The preview plays the local clip as the post will: from the trim start, in its square frame, with controls, and stops at the end.
      await t.tap('.prevbtn'); await t.see('.mgrid .k-video.crop', 15000);
      const vb = await t.page.locator('.mgrid .k-video').boundingBox(); expect(Math.abs(vb.width / vb.height - 1) < .03, 'player frame 1:1 ' + vb.width + 'x' + vb.height);
      await t.page.locator('.mgrid .k-video .k-vplay').click();
      await t.see('.mgrid .k-vbar input[type=range]'); await t.see('.mgrid .k-vbar button[aria-label="Включить звук"], .mgrid .k-vbar button[aria-label="Выключить звук"]');
      await t.wait(300);
      const at = await t.page.evaluate(() => document.querySelector('.mgrid video').currentTime);
      expect(at >= .45, 'starts at the trim start: ' + at);
      await t.shot('video-preview-playing');
      await until(async () => t.page.evaluate(() => document.querySelector('.mgrid video').paused), 'stops at the trim end', 6000);
      const back = await t.page.evaluate(() => document.querySelector('.mgrid video').currentTime);
      expect(Math.abs(back - .5) < .1, 'back to the trim start: ' + back);
      expect((await t.page.locator('.mgrid .k-vtime').innerText()).includes('/ 0:01'), 'shows the trimmed length');
      // Tap = play / pause.
      await t.page.locator('.mgrid .k-video').click({ position: { x: 20, y: 20 } }); await t.wait(300);
      expect(!(await t.page.evaluate(() => document.querySelector('.mgrid video').paused)), 'tap plays');
      await t.page.locator('.mgrid .k-video').click({ position: { x: 20, y: 20 } }); await t.wait(200);
      expect(await t.page.evaluate(() => document.querySelector('.mgrid video').paused), 'tap pauses');
      await t.tap('.ctabar .btn.primary');
      const p = await until(async () => (await mine(t)).find(x => x.body === body), 'post saved', 30000); id = p.id;
      expect(p.media.length === 1 && p.media[0].kind === 'video', 'kind ' + p.media[0]?.kind);
      // The scan sends every clip to staff; approve it as STAFF, then the post goes out.
      const asset = p.media[0].id;
      const ok = await until(async () => (await t.api('staff.mediaDecide', { opId: t.uuid7(), assetId: asset, decision: 'approve', explicit: false }, STAFF)).status === 200 || null,
        'staff approved the clip', 180000);
      expect(ok, 'approved');
      const out = await until(async () => (await mine(t)).find(x => x.id === id && x.state === 'published' && x.media[0]?.src?.file), 'published with a playable clip', 120000);
      if (!legacy) {
        const m = out.media[0];
        expect(m.clip?.startMs === 500 && m.clip.crop?.aspect === '1:1' && Math.abs(m.durationMs - (m.clip.endMs - m.clip.startMs)) < 5, 'stored edit ' + JSON.stringify(m.clip) + ' ' + m.durationMs);
      } else console.log('   (production predates video edit: stored-edit checks skipped)');
      await t.go('/n/feed/post/' + out.id);
      // One clip plays in place: our controls, then «На весь экран» opens the viewer, which plays it with the same controls.
      await t.see('.mgrid .k-video .k-vplay', 30000);
      await t.page.locator('.mgrid .k-video .k-vplay').click();
      await t.see('.mgrid .k-vbar input[type=range]', 10000);
      await t.page.locator('.mgrid .k-vbar button[aria-label="На весь экран"]').click();
      await t.see('.viewer .vw-track .k-video', 15000); await t.see('.viewer .k-vbar input[type=range]', 15000);
      await t.wait(800); await t.shot('video-viewer');
      await t.page.locator('.viewer .k-video .k-vplay').click({ force: true }); await t.wait(300);
      const paused = await t.page.evaluate(() => document.querySelector('.viewer video').paused);
      await t.page.locator('.viewer .k-video .k-vplay').click({ force: true }); await t.wait(300);
      expect(paused !== await t.page.evaluate(() => document.querySelector('.viewer video').paused), 'the centre button toggles in the viewer');
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
