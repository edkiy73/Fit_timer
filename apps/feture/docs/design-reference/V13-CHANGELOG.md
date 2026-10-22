# FetUre V13 — changelog

V13 is a copy of V12 (`public/prototype-v12.html`, now frozen). Contract test: `tests/prototype-v13-contract.mjs`.

## 2026-10-22 — gallery, albums, profile photos in the gallery, notes

- **Gallery on the profile** (own, other people, couple; also on «Профиль»): one 3-column grid of every post with photos or video — no photo/video split. Up to 4 rows on the profile, «Смотреть всё · N» opens the full gallery (P20).
- Tiles show the first picture; a counter marks posts with several pictures, a play mark marks video.
- Tapping a tile opens the post (likes, replies) with «‹ 2 из 7 ›» and a horizontal swipe to step through the gallery (or the chosen album).
- **Albums**: chips on P20 («Все», albums, «+ Альбом»); own albums can be renamed or deleted (posts stay in the gallery). The post composer offers «Альбом в галерее» (or «Новый альбом…») once a photo/video is attached; the post menu moves a published post between albums.
- **Profile photos in the gallery**: in the profile editor each photo/video has «Показывать и в галерее». On save it becomes a gallery post in the «Фото профиля» album and gets likes and replies; unticking or deleting the photo removes it. Such posts never appear in the feed or in «Мои публикации».
- **Notes**: a long-read post type — title (3–120), text up to 10 000 characters with headings/lists/quotes, optional cover photo. Feed card: cover, «Заметка · N мин чтения», title, excerpt, «Читать полностью»; the post screen shows the full text. Profile tab «Заметки» (empty own tab offers «Написать заметку»). Notes are not gallery tiles. Demo notes: n1 (Noa), n2 (Kai).
- Demo people get a deterministic gallery (6–11 posts, 1–3 pictures, 2–3 albums, replies and likes).
