// Wave 5 «Галерея и альбомы»: albums (create with checks, filter, menu: order, cover, move, rename, who sees it,
// delete + «Вернуть»), the selection mode (to an album, to the profile, who sees it, delete), the post menu's
// «Альбом в галерее» with «Новый альбом…», the composer's album row, profile photos from own posts.
// Setup publishes photo posts through the API (approved by STAFF first, so they go live at once); every scenario
// reads the result back from the server and removes the albums it made.
import { expect, until, toastSee, pick } from '../helpers.mjs';
import { STAFF, staff } from '../../personas.mjs';
import { uploadFixture } from '../../lib.mjs';

const TAG = 'e2e-w5 gallery';
const ok = (r, what) => { if (r.status && r.status >= 400) throw new Error(`${what}: ${r.status} ${JSON.stringify(r).slice(0, 200)}`); return r; };
const gallery = async (t, albumId) => (await t.api('gallery.list', { profileId: t.me.personId, ...(albumId ? { albumId } : {}) })).items ?? [];
const albums = async t => (await t.api('album.list', { profileId: t.me.personId })).items ?? [];
async function dropAlbums(t) { for (const a of await albums(t)) await t.api('album.delete', { opId: t.uuid7(), albumId: a.id }); }

/** At least `n` own photo posts for everyone in the gallery (published through the API). */
async function posts(t, n = 3) {
  let have = (await gallery(t)).filter(x => x.audience === 'all');
  if (have.length >= n) return have.slice(0, n);
  await staff();
  for (let i = have.length; i < n; i++) {
    const asset = await uploadFixture(t.me.email, 'post');
    for (let k = 0; k < 20; k++) { // the scan job runs first
      const r = await t.api('staff.mediaDecide', { opId: t.uuid7(), assetId: asset, decision: 'approve', explicit: false }, STAFF);
      if (r.status === 200) break;
      await t.wait(3000);
    }
    const d = ok(await t.api('post.saveDraft', { opId: t.uuid7(), post: { type: 'post', body: `${TAG} ${i + 1}`, audience: 'all', inFeed: false, mediaIds: [asset] } }), 'saveDraft');
    const p = ok(await t.api('post.publish', { opId: t.uuid7(), postId: d.id }), 'publish');
    expect(p.state === 'published', 'post published at once, got ' + p.state);
  }
  have = await until(async () => { const l = (await gallery(t)).filter(x => x.audience === 'all'); return l.length >= n && l; }, 'posts in the gallery');
  return have.slice(0, n);
}
const openGallery = async (t, albumId) => { await t.go(`/n/people/${t.me.personId}/gallery${albumId ? '?a=' + albumId : ''}`); await t.see('.ggrid'); };
const menu = async t => { await t.tap('button[aria-label="Настройки альбома"]'); await t.see('.sheet.on'); };

export default [
 { name: 'albums: «Новый альбом» checks empty and repeated names, «Выбрать» → «В альбом», the album card filters the grid', persona: 'full', run: async t => {
   await dropAlbums(t); const ps = await posts(t, 3);
   try {
     await openGallery(t);
     await t.tap('button[aria-label="Новый альбом"]');
     await t.tap('.sheet.on .sh-f button:has-text("Создать")'); await t.see('.sheet.on .ferr:has-text("Введи название")');
     await t.fill('#albumName', 'Мастерские W5'); await t.tap('.sheet.on .sh-f button:has-text("Создать")');
     await toastSee(t, 'Альбом «Мастерские W5» создан');
     const a1 = await until(async () => (await albums(t)).find(a => a.title === 'Мастерские W5'), 'album created');
     expect(t.page.url().includes('a=' + a1.id), 'the new album is open');
     await t.tap('button[aria-label="Новый альбом"]'); await t.fill('#albumName', 'мастерские w5'); await t.tap('.sheet.on .sh-f button:has-text("Создать")');
     await t.see('.sheet.on .ferr:has-text("уже есть")'); await t.page.keyboard.press('Escape'); await t.wait(400);
     expect((await albums(t)).length === 1, 'no duplicate album');
     // «Все» → «Выбрать» → two tiles → «В альбом» → the album
     await t.tap('.alb:has-text("Все")'); await t.tap('.bar button:has-text("Выбрать")');
     await t.see('.sel-bar'); await t.tap('.ggrid .gtile.sel-tile >> nth=0'); await t.tap('.ggrid .gtile.sel-tile >> nth=1');
     await t.see('.sel-count:has-text("Выбрано: 2")');
     await t.tap('.sel-bar button:has-text("В альбом")'); await t.tap('.sheet.on .li:has-text("Мастерские W5")');
     await toastSee(t, 'В альбоме «Мастерские W5»: 2');
     const inA = await until(async () => { const l = await gallery(t, a1.id); return l.length === 2 && l; }, 'two posts in the album');
     expect(inA.every(x => x.albumId === a1.id), 'albumId read back');
     await t.tap(`.alb:has-text("Мастерские W5")`); await t.see('.alb-meta:has-text("Мастерские W5")');
     await until(async () => (await t.page.locator('.ggrid .gtile:not(.add)').count()) === 2, 'the grid shows the album only');
     expect(ps.length === 3, 'setup');
   } finally { await dropAlbums(t); }
 } },
 { name: 'album menu: order, cover, move right, rename, followers only (posts too), open, delete + «Вернуть»', persona: 'full', run: async t => {
   await dropAlbums(t); const ps = await posts(t, 3);
   try {
     const a = ok(await t.api('album.create', { opId: t.uuid7(), title: 'Альбом A W5' }), 'create').album;
     ok(await t.api('album.create', { opId: t.uuid7(), title: 'Альбом B W5' }), 'create b');
     ok(await t.api('gallery.bulk', { opId: t.uuid7(), postIds: ps.slice(0, 2).map(x => x.postId), change: 'album', albumId: a.id }), 'bulk');
     await openGallery(t, a.id);
     await menu(t); await pick(t, 'Порядок', 'Сначала старые');
     await until(async () => (await albums(t)).find(x => x.id === a.id)?.sort === 'old', 'sort old');
     await t.page.keyboard.press('Escape'); await t.wait(300);
     await menu(t); await t.tap('.sheet.on .li:has-text("Обложка")'); await t.see('.sheet.on .gtile.pick');
     await t.tap('.sheet.on .gtile:not(.pick)'); await toastSee(t, 'Обложка обновлена');
     const cover = await until(async () => (await albums(t)).find(x => x.id === a.id)?.coverPostId, 'cover set');
     expect(ps.slice(0, 2).some(x => x.postId === cover), 'cover is one of the album posts');
     await menu(t); await t.tap('.sheet.on .li:has-text("Переставить правее")');
     await until(async () => (await albums(t)).map(x => x.title).join('|') === 'Альбом B W5|Альбом A W5', 'moved right');
     await menu(t); await t.tap('.sheet.on .li:has-text("Переименовать")'); await t.fill('#albumName', 'Альбом A2 W5');
     await t.tap('.sheet.on .sh-f button:has-text("Сохранить")'); await toastSee(t, 'Альбом переименован');
     await until(async () => (await albums(t)).some(x => x.title === 'Альбом A2 W5'), 'renamed');
     await menu(t); await pick(t, 'Кто видит', 'Только подписчики'); await t.tap('.dialog.on button:has-text("Закрыть альбом")');
     await toastSee(t, 'Альбом видят только подписчики');
     await until(async () => (await albums(t)).find(x => x.id === a.id)?.visibility === 'followers', 'album followers-only');
     expect((await gallery(t, a.id)).every(x => x.audience === 'followers'), 'its posts are followers-only too');
     await menu(t); await pick(t, 'Кто видит', 'Все участники'); await t.tap('.dialog.on button:has-text("Только альбом")');
     await until(async () => (await albums(t)).find(x => x.id === a.id)?.visibility === 'all', 'album open again');
     await menu(t); await t.tap('.sheet.on .li:has-text("Удалить альбом")'); await t.tap('.dialog.on button:has-text("Удалить")');
     await toastSee(t, 'Альбом удалён');
     await until(async () => !(await albums(t)).some(x => x.id === a.id), 'album deleted');
     await t.tap('.toast button:has-text("Вернуть")'); await toastSee(t, 'Альбом возвращён');
     const back = await until(async () => (await albums(t)).find(x => x.title === 'Альбом A2 W5'), 'album back');
     expect(back.count === 2 && back.sort === 'old', 'posts and order back: ' + JSON.stringify(back));
     expect((await albums(t))[1]?.id === back.id, 'its place in the row is back');
   } finally {
     await dropAlbums(t);
     // The followers-only step narrowed two posts: put them back for everyone through the API (they go to review).
   }
 } },
 { name: 'selection: «В профиль» adds photos of own posts; «Кто видит» narrows with «Отменить»; «Удалить» asks and deletes', persona: 'full', run: async t => {
   const ps = await posts(t, 3);
   const before = (await t.api('profile.get', { profileId: t.me.personId })).profile.photos.map(p => p.id);
   try {
     await openGallery(t);
     const target = ps[0].postId;
     const idx = async id => (await gallery(t)).findIndex(x => x.postId === id);
     await t.tap('.bar button:has-text("Выбрать")'); await t.tap(`.ggrid .gtile.sel-tile >> nth=${await idx(target)}`);
     await t.tap('.sel-bar button:has-text("В профиль")'); await toastSee(t, 'В профиле');
     const ph = await until(async () => { const l = (await t.api('profile.get', { profileId: t.me.personId })).profile.photos; return l.some(p => p.postId === target) && l; }, 'post photo on the profile');
     expect(ph.find(p => p.postId === target), 'postId read back');
     // the profile photo sheet: «Открыть публикацию» goes to the post
     await t.go('/n/me'); await t.see('.ph-slots');
     const i = ph.findIndex(p => p.postId === target);
     await t.tap(`.ph-slots .mi >> nth=${i} >> .vw`); await t.tap('.sheet.on .li:has-text("Открыть публикацию")');
     await until(async () => t.page.url().includes('/n/feed/post/' + target), 'the post opens');
     // «Кто видит» → only followers: the photo leaves the profile, the toast offers «Отменить»
     await openGallery(t);
     await t.tap('.bar button:has-text("Выбрать")'); await t.tap(`.ggrid .gtile.sel-tile >> nth=${await idx(target)}`);
     await t.tap('.sel-bar button:has-text("Кто видит")'); await t.tap('.sheet.on .li:has-text("Только подписчики")');
     await toastSee(t, 'Кто видит: только подписчики'); await t.see('.toast button:has-text("Отменить")');
     await until(async () => (await gallery(t)).find(x => x.postId === target)?.audience === 'followers', 'post narrowed');
     await until(async () => !(await t.api('profile.get', { profileId: t.me.personId })).profile.photos.some(p => p.postId === target), 'photo left the profile');
     // «Удалить» the narrowed post: asks, then it is gone
     await t.wait(5000);
     await t.tap('.bar button:has-text("Выбрать")'); await t.tap(`.ggrid .gtile.sel-tile >> nth=${await idx(target)}`);
     await t.tap('.sel-bar button:has-text("Удалить")'); await t.see('.dialog.on:has-text("Удалить публикации: 1?")');
     await t.tap('.dialog.on button:has-text("Удалить")'); await toastSee(t, 'Удалено');
     await until(async () => !(await gallery(t)).some(x => x.postId === target), 'post deleted');
   } finally { await t.api('profile.photosSet', { opId: t.uuid7(), assetIds: before }); }
 } },
 { name: 'post menu «Альбом в галерее» → «Новый альбом…» puts the post there; the editor\'s album row moves it; «Без альбома»', persona: 'full', run: async t => {
   await dropAlbums(t); const [p] = await posts(t, 1);
   try {
     await t.go('/n/feed/post/' + p.postId); await t.see('.post');
     await t.tap('button[aria-label="Ещё"]'); await t.tap('.sheet.on .li:has-text("Альбом в галерее")');
     await t.tap('.sheet.on .li:has-text("Новый альбом…")'); await t.fill('#albumName', 'Из меню W5'); await t.tap('.sheet.on .sh-f button:has-text("Создать")');
     await toastSee(t, 'Альбом создан, публикация в нём');
     const al = await until(async () => (await albums(t)).find(x => x.title === 'Из меню W5'), 'album from the menu');
     await until(async () => (await gallery(t)).find(x => x.postId === p.postId)?.albumId === al.id, 'post in the new album');
     const b = ok(await t.api('album.create', { opId: t.uuid7(), title: 'Через редактор W5' }), 'create').album;
     await t.go('/n/feed/post/' + p.postId + '/edit'); await t.see('select[aria-label="Альбом в галерее"]');
     await until(async () => (await t.page.locator('select[aria-label="Альбом в галерее"]').inputValue()) === al.id, 'the editor shows the current album');
     await pick(t, 'Альбом в галерее', 'Через редактор W5');
     await t.tap('.ctabar button:has-text("Правки на проверку"), .ctabar button:has-text("Сохранить изменения")');
     await until(async () => (await gallery(t)).find(x => x.postId === p.postId)?.albumId === b.id, 'editor moved the post');
     await t.go('/n/feed/post/' + p.postId); await t.see('.post');
     await t.tap('button[aria-label="Ещё"]'); await t.tap('.sheet.on .li:has-text("Альбом в галерее")'); await t.tap('.sheet.on .li:has-text("Без альбома")');
     await toastSee(t, 'Убрано из альбома');
     await until(async () => (await gallery(t)).find(x => x.postId === p.postId)?.albumId === null, 'post out of albums');
   } finally { await dropAlbums(t); }
 } },
 { name: 'profile photos: «Из публикаций» toggles a post photo on the profile, «Сохранить» writes it; «Посмотреть» opens the viewer on it', persona: 'full', route: '/n/me/edit?only=media', run: async t => {
   const [p] = await posts(t, 1);
   const before = (await t.api('profile.get', { profileId: t.me.personId })).profile.photos.map(x => x.id);
   try {
     await t.see('.grp:has-text("Из публикаций") .gtile');
     const tiles = t.page.locator('.grp:has-text("Из публикаций") .gtile');
     const n = await tiles.count(); let hit = -1;
     for (let i = 0; i < n; i++) if ((await tiles.nth(i).getAttribute('aria-pressed')) === 'false') { hit = i; break; }
     expect(hit >= 0 || before.length >= 6, 'a post photo that is not on the profile');
     if (before.length >= 6) return;
     await tiles.nth(hit).click(); await t.wait(300);
     expect((await tiles.nth(hit).getAttribute('aria-pressed')) === 'true', 'picked');
     await t.tap('.ctabar button:has-text("Сохранить")');
     const after = await until(async () => { const l = (await t.api('profile.get', { profileId: t.me.personId })).profile.photos; return l.length === before.length + 1 && l; }, 'profile has one more photo');
     expect(after.some(x => x.postId), 'the new one comes from a post');
     await t.go('/n/me'); await t.see('.ph-slots');
     await t.tap(`.ph-slots .mi >> nth=${after.length - 1} >> .vw`); await t.tap('.sheet.on .li:has-text("Посмотреть")');
     await t.see('.viewer.on');
     expect(p, 'setup');
   } finally { await t.api('profile.photosSet', { opId: t.uuid7(), assetIds: before }); }
 } },
 { name: '«+ Добавить» in an album opens the composer with photo picking and that album', persona: 'full', run: async t => {
   await dropAlbums(t); await posts(t, 1);
   try {
     const a = ok(await t.api('album.create', { opId: t.uuid7(), title: 'Добавить W5' }), 'create').album;
     await openGallery(t, a.id);
     const [chooser] = await Promise.all([t.page.waitForEvent('filechooser', { timeout: 15000 }), t.tap('.gtile.add')]);
     expect(!!chooser, 'photo picking opens');
     expect(t.page.url().includes('x=media') && t.page.url().includes('album=' + a.id), 'composer with the album: ' + t.page.url());
   } finally { await dropAlbums(t); }
 } },
];
