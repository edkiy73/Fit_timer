// Voice messages in H02 (owner, 28.10.2026): the mic replaces «Отправить» in an empty box; hold to record and release to
// send, slide left to cancel, a short tap records hands-free with «Стоп» → listen → delete / send; a refused microphone
// explains itself. Persona `chats` talks to `mate` (both sides read back through the API); `mic: true` grants the fake
// microphone (run.mjs launches Chromium with --use-fake-device-for-media-stream).
import { expect, toastSee, until } from '../helpers.mjs';
let CONV, MATE;
async function init(t) { const c = t.me.kind === 'chats' ? t.me : await t.persona('chats'); CONV = c.with.mate.conversationId; MATE = c.with.mate.email; }
const ready = async t => { await t.see('.msgs .msg.sys', 30000); };
const MIC = '.inputbar button[aria-label^="Голосовое"]';
const count = async (t, as) => ((await t.api('chat.messages', { conversationId: CONV, limit: 100 }, as)).items ?? []).length;
/** Holds the mic for `ms` (mouse = the pointer the recorder listens to); `dx` drags left before letting go. */
async function hold(t, ms, dx = 0) {
  const b = await t.page.locator(MIC).boundingBox(); if (!b) throw new Error('no mic button');
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await t.page.mouse.move(x, y); await t.page.mouse.down();
  await t.see('.k-rec', 8000); await t.wait(ms);
  if (dx) await t.page.mouse.move(x - dx, y, { steps: 8 });
  await t.page.mouse.up();
}

const scenarios = [
  { name: 'voice: a refused microphone says what to do, nothing is sent', persona: 'chats', route: '/n/chats/@CONV', run: async t => {
    await ready(t);
    const before = await count(t);
    await t.tap(MIC); // short tap = hands-free; the (unanswered) prompt is refused in a headless browser without the grant
    await toastSee(t, 'Нет доступа к микрофону', 10000);
    await t.notSee('.k-rec', 500);
    expect((await count(t)) === before, 'nothing sent');
  } },
  { name: 'voice: slide left cancels a held recording; nothing is sent', persona: 'chats', mic: true, route: '/n/chats/@CONV', run: async t => {
    await ready(t);
    const before = await count(t);
    await hold(t, 1200, 130);
    await t.notSee('.k-rec', 800);
    expect((await count(t)) === before, 'nothing sent after cancel');
  } },
  { name: 'voice: tap → hands-free, «Стоп» → listen before sending → delete; nothing is sent', persona: 'chats', mic: true, route: '/n/chats/@CONV', run: async t => {
    await ready(t);
    const before = await count(t);
    await t.tap(MIC);
    await t.see('.k-rec.locked:has-text("Запись идёт")', 8000);
    await t.wait(1800);
    await t.shot('voice-locked');
    await t.tap('.k-rec button[aria-label="Остановить и прослушать"]');
    await t.see('.k-rec.review .k-voice', 8000);
    await t.shot('voice-review');
    await t.tap('.k-rec.review button[aria-label="Слушать"]'); await t.wait(800); // the local recording plays
    await t.tap('.k-rec.review button[aria-label="Удалить запись"]');
    await t.notSee('.k-rec', 500);
    expect((await count(t)) === before, 'nothing sent after delete');
  } },
  { name: 'voice: hold → release sends; the partner gets audio with its length and waveform, plays it, the sender sees «Прослушано»', persona: 'chats', mic: true, route: '/n/chats/@CONV', run: async t => {
    await ready(t);
    await hold(t, 2500);
    // Optimistic bubble first, then the server's message (purpose voice, approved by the scan as sound only).
    const got = await until(async () => {
      const items = (await t.api('chat.messages', { conversationId: CONV }, MATE)).items ?? [];
      const m = items.at(-1); return m && m.media?.kind === 'audio' && !m.mine ? m : null;
    }, 'the partner has the voice message', 60000);
    expect(got.media.durationMs >= 2000 && got.media.durationMs <= 6000, 'length ' + got.media.durationMs);
    expect(Array.isArray(got.media.peaks) && got.media.peaks.length > 0, 'waveform');
    // The scan approves sound-only files in the background (jobs cron): wait for the link, then «play» as the partner.
    const playable = await until(async () => {
      const m = ((await t.api('chat.messages', { conversationId: CONV }, MATE)).items ?? []).find(x => x.id === got.id);
      return m?.media?.src?.file ? m : null;
    }, 'voice message approved and playable', 180000);
    expect(playable.media.listened === false, 'not listened yet');
    const r = await t.api('chat.listened', { messageId: got.id }, MATE);
    expect(r.listened === true, 'listened: ' + JSON.stringify(r));
    await t.page.reload(); await ready(t);
    await t.see('.msgs .msg.me .k-voice:has-text("Прослушано")', 30000);
    await t.shot('voice-heard');
  } },
];
// The route names the lane's conversation (@CONV), known only once the personas are built.
export default scenarios.map(sc => ({ ...sc, route: null, run: async t => {
  await init(t);
  if (sc.route) await t.go(sc.route.replace('@CONV', CONV));
  await sc.run(t);
} }));
