// Video (owner, 28.10.2026: «Зачем грузить огромные файлы ради кусочка?»): the composer and the chat take a clip through
// the kit Uploader, which trims and crops it and makes it on the device before upload — only the chosen part, in the
// chosen frame, ≤ 1280 px, compressed (WebCodecs → MP4 H.264/AAC in Chrome; the recorder → WebM in Playwright's Chromium,
// which has no H.264). What is uploaded is read back: shorter, smaller and in the chosen shape. Clips always go to staff
// review; STAFF approves, then the card and the viewer play it. Clean-up deletes the post.
//   Both paths: run once as is (Chromium: recorder) and once with E2E_CHANNEL=chrome (WebCodecs).
import { STAFF } from '../../personas.mjs';
import { expect, sourceClip, until, watchVideoUpload } from '../helpers.mjs';

const mine = async t => (await t.api('me.posts', {})).items ?? [];
const near = (a, b, d) => Math.abs(a - b) <= d;

export default [
  { name: 'video post: a 4 s 1280×720 source → 4:5, trim, crop → «Готовим видео» → the uploaded clip is the part, 4:5, smaller → preview plays it; staff approves → inline player and viewer', persona: 'full', route: '/n/feed/new', run: async t => {
    let id; const up = watchVideoUpload(t);
    try {
      await t.see('.compose .rte-ed');
      const src = await sourceClip(t, { w: 1280, h: 720, seconds: 4 });
      const [ch] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.locator('.attach button').first().click()]);
      await ch.setFiles([src]);
      await t.see('.sheet.on .k-uprow:has-text("Видео · 0:04")', 20000);
      await t.see('.sheet.on .k-uprow .k-vbadge');
      // The note says it plainly: a source up to 10 minutes, a part up to a minute is sent, made on the device.
      await t.see('.sheet.on .alert:has-text("до 10 минут")');
      await t.tap('.sheet.on .seg button:has-text("4:5")'); await t.wait(1500);
      const th = await t.page.locator('.sheet.on .k-upthumb').first().boundingBox();
      expect(near(th.width / th.height, .8, .03), '4:5 preview: ' + th.width + 'x' + th.height);
      const name = await t.page.locator('.sheet.on .k-uptx b').first().boundingBox();
      const acts = await t.page.locator('.sheet.on .k-upacts .btn').evaluateAll(l => l.map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), b.textContent.trim()]; }));
      expect(acts.map(a => a[2]).join(',') === 'Обрезать,Кадрировать', 'actions ' + acts.map(a => a[2]));
      expect(Math.abs(acts[0][0] - name.x) <= 1 && acts.every(a => a[1] === acts[0][1]), 'actions on one line at the text edge ' + JSON.stringify(acts) + ' name ' + name.x);
      await t.shot('video-uploader');
      // Trim: 0.5 s off the start (arrows: 0.1 s), 1 s off the end (Shift: 1 s); the note says only the part is sent.
      await t.tap('.sheet.on .k-upacts button:has-text("Обрезать")');
      await t.see('.sheet.on .k-trim-strip'); await t.see('.sheet.on:has-text("Отправится только этот отрезок")'); await t.wait(1200);
      await t.page.locator('.k-trim-h.l').focus(); for (let i = 0; i < 5; i++) await t.page.keyboard.press('ArrowRight');
      await t.page.locator('.k-trim-h.r').focus(); await t.page.keyboard.press('Shift+ArrowLeft');
      const part = await t.page.evaluate(() => { const [a, b] = [...document.querySelectorAll('.k-trim-h')].map(h => h.getAttribute('aria-valuetext')); const ms = s => { const [m, r] = s.split(':'); return (+m * 60 + +r) * 1000; }; return ms(b) - ms(a); });
      await t.shot('video-trim');
      await t.tap('.sheet.on .sh-f button:has-text("Применить")');
      await t.see('.sheet.on .k-uprow:has-text("из 0:04")', 15000);
      // Crop: the photo crop sheet on the frame at the trim start.
      await t.tap('.sheet.on .k-upacts button:has-text("Кадрировать")'); await t.see('.k-crop img');
      const b = await t.page.locator('.k-crop').boundingBox(); expect(near(b.width / b.height, .8, .02), 'frame 4:5');
      await t.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await t.page.mouse.down(); await t.page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2, { steps: 5 }); await t.page.mouse.up();
      await t.page.locator('.k-crop-zoom input').fill('1.3'); await t.shot('video-crop');
      await t.tap('.sheet.on .sh-f button:has-text("Применить")'); await t.see('.sheet.on .k-uprow:has-text("из 0:04")', 15000);
      await t.tap('.sheet.on .sh-f button:has-text("Готово")');
      // Made on the device first («Готовим видео… N%» with «Отменить»; fast with WebCodecs, real time with the recorder).
      try { await t.see('.sheet.on .k-uprow:has-text("Готовим видео")', 3000); await t.shot('video-making'); } catch { console.log('   (made before the progress could be seen)'); }
      await t.see('.edit-ph .k-vbadge', 90000);
      const i = up.intent; expect(i, 'upload intent sent');
      console.log('   source', src.size, 'B, 4.1 s 1280×720 → uploaded', i.bytes, 'B,', i.durationMs, 'ms,', i.mime, JSON.stringify(up.put));
      expect(!('edit' in i), 'no edit goes to the server');
      expect(i.bytes < src.size / 2, 'uploaded clip much smaller: ' + i.bytes + ' of ' + src.size);
      expect(near(i.durationMs, part, 400) && i.durationMs < 3600, 'uploaded clip is the part: ' + i.durationMs + ' ≈ ' + part);
      expect(['video/mp4', 'video/webm'].includes(i.mime), 'mime ' + i.mime);
      if (up.put) expect((up.put.mp4 && up.put.avc && up.put.aac) || (up.put.webm && up.put.opus), 'MP4 H.264 + AAC or WebM + Opus, with sound: ' + JSON.stringify(up.put));
      const tile = await t.page.locator('.edit-ph > div').first().boundingBox();
      expect(near(tile.width / tile.height, .8, .03), 'composer tile 4:5 ' + tile.width + 'x' + tile.height);
      const body = 'e2e видео ' + Math.random().toString(36).slice(2, 7); await t.fill('.compose .rte-ed', body);
      // The preview plays the made file: 4:5 pixels, the part's length, our controls.
      await t.tap('.prevbtn'); await t.see('.mgrid .k-video', 15000);
      await t.page.locator('.mgrid .k-video .k-vplay').click();
      await t.see('.mgrid .k-vbar input[type=range]'); await t.see('.mgrid .k-vbar button[aria-label="Включить звук"], .mgrid .k-vbar button[aria-label="Выключить звук"]');
      const v = await until(() => t.page.evaluate(() => { const e = document.querySelector('.mgrid video'); return e && e.videoWidth ? { w: e.videoWidth, h: e.videoHeight, d: e.duration } : null; }), 'preview loaded', 10000);
      expect(near(v.w / v.h, .8, .02) && Math.max(v.w, v.h) <= 1280, 'made clip 4:5 ≤ 1280: ' + v.w + '×' + v.h);
      await t.shot('video-preview-playing');
      await until(async () => t.page.evaluate(() => document.querySelector('.mgrid video').paused), 'stops at the end', 8000);
      // Tap = play / pause.
      await t.page.locator('.mgrid .k-video').click({ position: { x: 20, y: 20 } }); await t.wait(300);
      expect(!(await t.page.evaluate(() => document.querySelector('.mgrid video').paused)), 'tap plays');
      await t.page.locator('.mgrid .k-video').click({ position: { x: 20, y: 20 } }); await t.wait(200);
      expect(await t.page.evaluate(() => document.querySelector('.mgrid video').paused), 'tap pauses');
      await t.tap('.ctabar .btn.primary');
      const p = await until(async () => (await mine(t)).find(x => x.body === body), 'post saved', 30000); id = p.id;
      expect(p.media.length === 1 && p.media[0].kind === 'video', 'kind ' + p.media[0]?.kind);
      // Read back from the API once scanned: the stored clip's shape (from its poster = first frame) and length.
      const m = await until(async () => (await mine(t)).find(x => x.id === id)?.media[0]?.w ? (await mine(t)).find(x => x.id === id).media[0] : null, 'scanned', 120000);
      console.log('   stored', m.w + '×' + m.h, m.durationMs, 'ms');
      expect(near(m.w / m.h, .8, .02) && Math.max(m.w, m.h) <= 1280, 'stored 4:5 ≤ 1280: ' + m.w + '×' + m.h);
      expect(near(m.durationMs, part, 500), 'stored length is the part: ' + m.durationMs + ' ≈ ' + part);
      expect(!('clip' in m), 'no clip edit in the DTO');
      // The scan sends every clip to staff; approve it as STAFF, then the post goes out.
      const ok = await until(async () => (await t.api('staff.mediaDecide', { opId: t.uuid7(), assetId: m.id, decision: 'approve', explicit: false }, STAFF)).status === 200 || null,
        'staff approved the clip', 180000);
      expect(ok, 'approved');
      const out = await until(async () => (await mine(t)).find(x => x.id === id && x.state === 'published' && x.media[0]?.src?.file), 'published with a playable clip', 120000);
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
  { name: 'video in chat: «Видео» → the kit Uploader (preview, 1:1, view rule) → «Отправить» → made on the device; the uploaded clip is shorter, smaller, square; the partner reads kind video', persona: 'chats', run: async t => {
    const c = t.me; const conv = c.with.mate.conversationId; const mate = c.with.mate.email; const up = watchVideoUpload(t);
    await t.go('/n/chats/' + conv); await t.see('.msgs .msg.sys', 30000);
    const src = await sourceClip(t, { w: 1280, h: 720, seconds: 3 });
    await t.tap('button[aria-label="Вложение"]');
    await t.see('.sheet.on:has-text("Фото или видео")');
    const [ch] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.locator('.sheet.on .li:has-text("Видео")').click()]);
    await ch.setFiles([src]);
    // Preview before sending: the same uploader as the composer, with the chat's view rule under the list.
    await t.see('.sheet.on .k-uprow:has-text("Видео · 0:03")', 20000);
    await t.see('.sheet.on .k-uprow .k-vbadge'); await t.see('.sheet.on select'); await t.see('.sheet.on .sh-f button:has-text("Отправить")');
    await t.tap('.sheet.on .seg button:has-text("1:1")'); await t.wait(1200);
    await t.tap('.sheet.on .k-upacts button:has-text("Обрезать")'); await t.see('.sheet.on .k-trim-strip'); await t.wait(800);
    await t.page.locator('.k-trim-h.r').focus(); await t.page.keyboard.press('Shift+ArrowLeft');
    await t.tap('.sheet.on .sh-f button:has-text("Применить")'); await t.see('.sheet.on .k-uprow:has-text("из 0:03")', 15000);
    await t.shot('video-chat-send');
    await t.tap('.sheet.on .sh-f button:has-text("Отправить")');
    await t.page.locator('.sheet.on').waitFor({ state: 'detached', timeout: 90000 });
    const i = up.intent; expect(i, 'upload intent sent');
    console.log('   chat source', src.size, 'B → uploaded', i.bytes, 'B,', i.durationMs, 'ms,', i.mime);
    expect(i.bytes < src.size / 2 && i.durationMs < 2600, 'shorter and smaller: ' + i.bytes + ' B, ' + i.durationMs + ' ms');
    const got = await until(async () => {
      const m = ((await t.api('chat.messages', { conversationId: conv }, mate)).items ?? []).at(-1);
      return m && !m.mine && m.media?.kind === 'video' ? m : null;
    }, 'the partner has a video message', 90000);
    expect(got.media.src?.file === undefined, 'no clip link before review / while covered');
    const own = await until(async () => { const m = ((await t.api('chat.messages', { conversationId: conv })).items ?? []).find(x => x.id === got.id); return m?.media?.w ? m.media : null; }, 'scanned', 120000);
    expect(near(own.w / own.h, 1, .02), 'stored square: ' + own.w + '×' + own.h);
  } },
];
