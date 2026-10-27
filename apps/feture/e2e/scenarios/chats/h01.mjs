// H01 chat list + H05 archive. Persona `chats` has conversations with `mate`, `asker` and `basic` (each with messages);
// a fresh match is made with `stranger` and ended again.
const rows = t => t.page.locator('.chat-row');
const KAIc = t => t.me.with.mate.conversationId, KAIn = t => t.me.with.mate.handle;

export default [
  { name: 'H01 list loads with rows, no empty state, no skeleton left', persona: 'chats', route: '/n/chats', run: async t => {
    await rows(t).first().waitFor({ timeout: 30000 });
    for (const o of Object.values(t.me.with)) await t.see(`.chat-row:has-text("${o.handle}")`);
    await t.notSee('Пока нет диалогов', 500);
    if (await t.page.locator('.sk').count()) throw new Error('skeleton still shown');
    await t.shot('h01-list');
  } },
  { name: 'H01 search filters, «nothing found» + clear, close', persona: 'chats', route: '/n/chats', run: async t => {
    await rows(t).first().waitFor({ timeout: 30000 });
    await t.tap('button[aria-label="Поиск по чатам"]');
    await t.fill('Имя или ник', 'mate');
    await t.see(`.chat-row:has-text("${KAIn(t)}")`);
    if (await rows(t).count() !== 1) throw new Error('search should leave one row, got ' + await rows(t).count());
    await t.fill('Имя или ник', 'zzzqqq');
    await t.see('Ничего не нашли');
    await t.tap('Сбросить');
    if (await rows(t).count() < 3) throw new Error('clear should bring rows back');
    await t.fill('Имя или ник', 'mate');
    await t.tap('button[aria-label="Закрыть поиск"]');
    if (await t.page.locator('input[type=search]').count()) throw new Error('search field still open');
    if (await rows(t).count() < 3) throw new Error('closing search should reset the filter');
  } },
  { name: 'H01 row opens the chat, back returns to the list', persona: 'chats', route: '/n/chats', run: async t => {
    await rows(t).first().waitFor({ timeout: 30000 });
    await t.tap(`.chat-row:has-text("${KAIn(t)}")`);
    await t.see('.msgs .msg.sys', 30000);
    if (!t.page.url().includes('/n/chats/' + KAIc(t))) throw new Error('wrong url ' + t.page.url());
    await t.tap('css=header button[aria-label="Назад"]');
    await rows(t).first().waitFor({ timeout: 20000 });
  } },
  { name: 'H01 new match appears in «Новые совпадения» and opens an empty chat with starters', persona: 'chats', route: null, run: async t => {
    // A fresh match with `stranger` (ended again at the end from their side; without messages it leaves the list).
    const st = await t.persona('stranger'), NOA_EMAIL = st.email;
    const me = t.me.personId, noa = st.personId;
    await t.api('match.end', { opId: t.uuid7(), profileId: me }, NOA_EMAIL);
    try {
      await t.api('block.set', { opId: t.uuid7(), profileId: noa, on: false });
      const a = await t.api('like.send', { opId: t.uuid7(), profileId: noa, source: 'profile' });
      const b = await t.api('like.send', { opId: t.uuid7(), profileId: me, source: 'profile' }, NOA_EMAIL);
      if (a.state !== 'matched' && b.state !== 'matched') throw new Error('no match: ' + JSON.stringify([a, b]));
      await t.go('/n/chats');
      await t.see('Новые совпадения', 30000);
      await t.tap(`.matches button:has-text("${st.handle}")`);
      await t.see('Взаимная симпатия.', 30000);
      await t.see('.chips .chip');
      await t.shot('h01-newmatch-chat');
      await t.tap('.chips .chip');
      const v = await t.page.locator('.inputbar textarea').inputValue();
      if (!v) throw new Error('starter chip did not fill the input');
    } finally {
      await t.api('match.end', { opId: t.uuid7(), profileId: me }, NOA_EMAIL);
    }
  } },
  { name: 'H05 archive: archive from menu → in archive, open from archive, unarchive → back in list', persona: 'chats', route: null, run: async t => {
    const KAI = KAIc(t), name = KAIn(t);
    try {
      await t.go('/n/chats/' + KAI);
      await t.see('.msgs .msg.sys', 30000);
      await t.tap('css=header button[aria-label="Информация о диалоге"]');
      await t.tap('.sheet .li:has-text("В архив")');
      await t.see('Диалог в архиве');
      await rows(t).first().waitFor({ timeout: 20000 });
      await t.notSee(`.chat-row:has-text("${name}")`, 800);
      const arch = await t.api('chats.list', { filter: 'all', archived: true });
      if (!arch.items.some(c => c.id === KAI)) throw new Error('not archived on server');
      // Regression: «chat.archive» had no opId, so the client cached it as a read and the archive list stayed stale.
      await t.tap('button[aria-label="Архив"]');
      await t.see(`.chat-row:has-text("${name}")`);
      await t.tap(`.chat-row:has-text("${name}")`);
      await t.see('.msgs .msg.sys', 30000);
      await t.tap('css=header button[aria-label="Информация о диалоге"]');
      await t.tap('.sheet .li:has-text("Вернуть из архива")');
      await t.see('Диалог возвращён');
      const back = await t.api('chats.list', { filter: 'all', archived: false });
      if (!back.items.some(c => c.id === KAI)) throw new Error('not unarchived on server');
      await t.tap('css=header button[aria-label="Назад"]');
      await t.see(`.chat-row:has-text("${name}")`);
    } finally {
      await t.api('chat.archive', { conversationId: KAI, on: false });
    }
  } },
  { name: 'H05 archive shows rows or only the empty state, never both', persona: 'chats', route: '/n/chats?archived=1', run: async t => {
    await t.wait(4000);
    const n = await rows(t).count();
    if (n === 0) await t.see('Архив пуст');
    else await t.notSee('Архив пуст', 300);
    if (await t.page.locator('.sk').count()) throw new Error('skeleton still shown');
  } },
];
