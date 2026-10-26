# Notes — section `evcomm` (events + communities)

Status: **done**: 55 findings (P1 8, P2 23, P3 24), coverage written.

Files:
- `work/findings-evcomm.json`, `work/coverage-evcomm.json`
- screenshots: `screens/issues/evcomm/*.png`
- scripts: scratchpad `pw/evcomm/s*.mjs` (helpers `u.mjs` with `bpage()`, which pins the browser to Europe/Berlin; `fill.mjs` fills E11),
  findings generator `pw/evcomm/out/f1..f6.py` + `tail.py` → `all.py`, coverage `out/cov.py`.

## Method notes
- The machine's time zone is Asia/Irkutsk. All checks ran with `timezoneId: Europe/Berlin` (`bpage`). With the system zone, online events show 00:30 and similar times. That is not a bug.
- `QA.autoApprove` is **on by default**. Any `autoResolve()` (a community request, an application, an event) approves everything pending, including the seeded «Квир Берлин» request and the e1 application. To test pending states, set `qa(p,'qaAuto','wait')` first.
- The partner is tested with `qaPairMember partner`. To make Alex's couple actions wait for Kira: as partner → Q01 → «Подтверждение партнёром» → «С моим подтверждением».
- `FT_QA.back()` after `go()` on a pushed screen can land on the tab root (the QA stack has one item). It is a QA artefact, not a bug.

## Seen in code, not filed (not reproducible through the UI)
- `ACT.cCancelReq` (7160) marks only `req.p==='me'` requests as withdrawn. A request the couple withdraws stays `pending` in `S.communityRequests` for the owner. The UI can't show this: the couple can't send a request to a community the account owns, because `ownsCommunity` ignores the profile.
- The community filter count (`cnt`, 7087) doesn't exclude `status:'review'` communities of other people, but the list does (7069). The demo has no such communities.
- `pairNotify('rsvpApproval', …, {go:['Q01']})`: the notification leads to «Настройки пары», not to «Нужно решить».
- `qaApproveAll` approves applications only for the current actor's `rsvpMap()`.

## Overlaps with other sections (mentioned in `places` only)
- Toasts covering controls in sheets (COMM-005): global toast placement.
- The «Комьюнити» dock label is cut at 320 px (COMM-013): dock.
- «Паретолько что» (tag glued to the time) in notifications (EVT-010): notifications.
- `pname('me')` returns the nickname (EVT-025): profile/core.

## Not checked
- The uploader for the event cover and photos (shared media component).
- EN locale.
- C07 media and mentions (shared post editor).
- The activity tab and the profile after an event answer.
