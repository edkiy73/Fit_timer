# Couple / chats / notifications audit — notes (section `couple`)

Scripts: scratchpad `pw/couple/*.mjs` (lib.mjs wraps ../h.mjs). Screens: `audit-v20/screens/issues/couple/**`.

## Done
- s1–s3: dock «Я/Мы» tab, act-as sheet (390/320), popover (1024/1440): focus, Esc, scrim, arrows, open-profile icon, toast.
- s4 walk: 22 screens, Я → switch to Мы on the screen → back (walk/*.png). Labels «от пары» checked.
- s5: N01 «Нужно решить» — every card approved one by one, counts dock/bell/tabs/sections tracked.
- l0–l4: lifecycle from persona full: entry to couple creation (none!), Q01 nickname validation, invite, QA invite as partner,
  decline, accept → Q09 → Q01; new couple X01 (seeded gallery leak), Q05, Q03, QA incoming / photos, Q06 unlink → Q07 → Q08,
  restore 1/2 → 2/2, unlink + QA +31 days → expired, «Создать новую пару».
- a1–a4: partner approval: trust sheet, QA partner edits basics → «Отправить Kira» bug, review sheet approve/return,
  couple visibility setting opening → «Ждёт согласия партнёра».
- c1–c5: H01 tabs/search/archive/new matches, H02 couple + personal: send, offline fail/retry, long-press/right-click menu,
  reply (composer hidden), chatDown covered / covering send, chat menu, mute, archive, H05, end connection, block,
  starters (Sofi), disappearing / one-view media + QA clock.
- m1: couple like-back → «Это взаимно» → couple chat; event answers as couple; E06 application as couple.
- r1: 320 / 1440 screenshots of H01, H02, N01, X01 Мы, Q01, P05.

## Not checked / partial
- Q10 (needs a second couple in history), attach → send media sheet (file chooser), dark theme, EN.
- Real two-client couple behaviour (prototype simulates partner via QA).

## Result (written)
- findings-couple.json: 40 findings — P0 1, P1 7, P2 17, P3 15. coverage-couple.json: 38 entries.
- Referenced lead items instead of duplicating: VIS-009 (see-through chat header), RESP-001 (two own avatars in sidebar), RESP-004 (wait line at 320), RESP-002.
- Not filed (seen, low value / by design): violet top stripe in «Мы»; Esc on a screen without overlay = back; «Одобрено сразу» QA toast.
