# notes-feed (section auditor: feed, prefix FEED-)

Status: DONE. 43 findings in work/findings-feed.json (P0 3, P1 3, P2 18, P3 19); coverage in work/coverage-feed.json (51 entries).
Screens: audit-v20/screens/issues/feed/FEED-0xx*.png (+ a few extra reference shots: FEED-joint-review, FEED-poll-*, FEED-video-upload, FEED-search, FEED-result-editor, FEED-article-preview, FEED-f10-couple-pending, FEED-jar-sheet).
Scripts (reproductions): scratchpad/pw/feed/*.mjs (lib.mjs = harness wrapper; findings*.mjs + build.mjs generate the JSON; cov.mjs → coverage).

Covered: F01 (Для тебя / Подписки / Популярное, quick chips, filters, activity cards, event cards, empty states), post ⋯ menu (all items, Я/Мы scope),
like/likers/save/share, F05 replies (send, nested, like, delete), viewer, poll, article, F04, create sheet, F07 (text/photo/video/poll/article/interests,
audience, feed switch, RTE, mentions, link), drafts, leave guard, F09, publish, review (FT_QA.approveAll), small/large edit, delete, F10 (Я/Мы),
couple post + partner approval, M01, QA likes/note, 320/1440, dark (brief), EN (terms).

Not checked / partial: touch double-tap/pinch zoom in viewer (no real touch), keyboard-open dock hiding (no virtual keyboard), real clipboard,
«Все · 75» topics sheet selection by hand, dark/EN only spot checks.
Notes: qaPv approves profile photo verification, not posts — use FT_QA.approveAll() for post review.
Unconfirmed (not filed): reply-like pairNotify key uses undefined x.i ('rlike_<id>_undefined') — partner may get only one notification per post; no toast after partner «Одобрить» in «Согласование публикации» (not reproduced reliably).
