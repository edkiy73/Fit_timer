# FetUre V12 — changelog

V12 is a copy of V11 (`public/prototype-v11.html`, frozen) with a new two-person interest comparison.
Decision record: `public/prototype-v11-compare-matrix.html`. Notes: `public/prototype-v12-notes.html`.

## 2026-10-21 — comparison matrix

- No universal score (spec: «без общего процента»). Summary in words.
- Groups: complement, match, worth trying, worth discussing, boundaries (+ «not enough data»).
- Strong = 6–10, weak = 1–5. Both strong → match; explicit give↔receive → complement; same single role → discuss; gap ≥ 4 → discuss; close weak levels → worth trying; negotiable → discuss.
- Limits are compared only when public; hidden/granted answers are never used or hinted at.
- UI: reference capsule rows (static) on P05 and in the profile/discovery compat block.
- Test data: more public answers for the full persona; people zoe, mark, ira, ren, vera, oli; P05 «Compare with» switcher; QA menu entries.

## 2026-10-21 — jars replaced everywhere

- `jarsHTML` now renders the reference capsule rows (same options), so every screen that showed V11 jars shows capsules: my interests, profile, other profiles, quiz results, posts, welcome slide.
- Fill stops before the score for 1–9; 10 fills the whole row. Hard limit = hatch, negotiable = dashed outline.
- UI copy no longer says «баночка».

## 2026-10-21 — add-interests flow

- Each interest step starts with «Как тебе ближе» (preset «Всё») and «Кто видит» chips (per interest; hidden when the audience is fixed).
- Tapping a level, «обсуждаемо» or «табу» moves to the next interest after a short pause.
- Final step «Проверь ответы»: drafted answers as capsules (tap to edit), Save / Back / Cancel. Replaces the old single «who sees» step.

## 2026-10-21 — UI/UX pass on the add/edit flow

- Review step: sheet fits its content (was full-height with a big gap above Save); Cancel · Back · Save in one row; editing an item from the review returns to the review.
- Edit sheet uses the add-flow order: role chips (preset «Всё»), audience chips, then the level; role chips are dimmed for taboo/negotiable.
- Other person's interest sheet shows the comparison capsule instead of the old badge row.

## 2026-10-21 — translucent capsules, poll-style fill

- Track is translucent (`--trk`), fill is a translucent accent whose strength follows the level; one label (no white duplicate), same grow animation as polls.
- Poll fill: rounded ends, no wavy mask, no bubbles.
- Compat block in profile/discovery: inner padding; «Я» avatar is a solid accent circle.

## 2026-10-21 — polish from phone review

- Dock counters have no ring (the dock is translucent over any content).
- Interest names in capsules wrap to two lines instead of being cut with «…».
- Reason lines under comparison rows shortened to one line («Вы оба хотите давать», «Общая граница»).
- Removed the prototype-only «Сравнить с» switcher from P05; the six test people are in the discovery deck instead, so comparison looks exactly like the real screen.

## 2026-10-21 — owner phone review

- Top-aligned left thumbnails across activity, member, chat, request and profile rows; shorter text remains centred.
- Added «Мои интересы / My interests» to post attachments; poll question/options/footer form one card.
- One separator per mixed-feed boundary; removed counters from the first two Access tabs.
- New couple invitations work immediately after dissolution or expiry. Recovery ends when the new invitation is accepted. The new identity inherits no grants, trust, chats or drafts; former post text remains in a separate archive.
- Acceptance uses the invited partner, not the former partner; focused contract covers both timings and repeated replacement.
- QA join toast uses community names instead of rope/first and identifies the test action.

## 2026-10-21 — follow-up phone refinements

- «Мои интересы» attachment heading: 13px, quieter weight and muted colour; 12px card padding matches polls on all sides.
- «Скоро рядом» is a proper feed item with a top divider and 16px vertical padding, matching posts; heading aligns with the content edge.
- Removed obsolete QA actions that simulate the partner joining/leaving communities or being restricted there, including their toast handlers. Community participation is personal, not a shared-couple action. This does not change real personal membership or expose a partner’s activity.

## 2026-10-21 — phone review, round 3

- Event attendance visibility is selected on each event (Show by default); removed the global setting. Visibility changes do not change RSVP or admission.
- Photo verification uses a bounded preview card, compact retake action and expandable explanatory details. Cancelling a retake preserves the previous selfie.
- Footer button groups use one 8px gap, without stacked automatic margins.
- Interest pages show the description and either the saved capsule or one add-interest action.
- Applicant answer text aligns with the outer card; event/community request cards share compact spacing.
- Age range has no enclosing card border. History card names use a dedicated class, ellipsis and a gradient (fixes notification-card style collision).
- Unavailable profile likes are a small status line, leaving Follow as the action.
- Event/community management entries share one button; dashboard counters open their related lists, including empty states. The owned sample event includes two explicitly public interested people, so the list can be tested.

## 2026-10-22 — owner review: access, shared approvals and remaining UI

- Attendance visibility uses complete Show/Hide chips. Event/community management entries share full-width sizing. Inbox application answers use the same left edge and compact spacing as application pages.
- Access has no tab counters. Scope and expiry are chips; private Interests permission removed (description/photos/video only). Personal grants tested through the actual inbox action.
- Recently viewed remains reachable from the People header while candidates remain. Profile likes explicitly disabled can coexist with dating likes; settings explain the distinction.
- Every video frame uses the photo Instafill pattern: whole content over a blurred backdrop, including previews, private galleries and full-screen playback. An intentionally selected crop is retained.
- Couple approval preferences are independent per member, defaulting to no approval. A member chooses whether the partner's shared actions need their approval, including profile/settings/interests/media/posts/private access. Immediate changes still notify both members.
- Saving the couple profile automatically publishes or submits the complete revision. Removed the second Send draft step; accepting/rejecting checks current proposal identity, revision, draft version and session. Preference revisions invalidate in-flight writes without invalidating unrelated pending grants.
- Added focused V12 contracts for independent defaults, automatic delivery, stale profile/grant rejection and real personal grant actions. Prototype-only: no backend or frozen V10/V11 changes.

## 2026-10-22 — People header repaired

- «Просмотренные» is an icon button in the single header row (tabs · couple author · history · filters), not a second full-width row. It appears only in Discover while dating is on; the Likes tab keeps the bell.
- With a couple profile the previous `nowrap` + full-width history entry collapsed the Discover/Likes tabs to zero width and pushed the label off-screen. Tabs now use `minmax(0,1fr)` columns and never wrap.
- ≤374px: tighter gaps/padding, 36px icons, 40px author avatar. ≤359px with a couple: 34/36px controls and the Likes counter sits on the tab corner, so both labels stay whole at 320px.

## 2026-10-22 — People and couple profile, owner round

- Likes «Тебе»: cards show only name and age (no source chip, no match captions). New × on each card — don't answer and remove from the list (counts as passed in Discover, with Undo). Cards swipe like the deck: right — like back, left — pass; a tap still opens the profile.
- Deck key button: when access is already open it scrolls the same card to the private part instead of opening the full profile.
- People header: the author avatar is the size of the neighbouring icon buttons (40/36/34px), no ring or background — just the photo.
- «Показывать пару в знакомствах» moved from the couple profile editor to couple settings (Q01, renamed «Настройки пары»). Off is immediate for either partner; on is published at once when partners trust each other, otherwise it waits for the partner.
- Couple profile uses the solo components: on Profiles it is the same card as the solo profile (tap — «как видят», «Изменить профиль», gear — couple settings); the couple page (Q03 and all couple links) is the same «как видят» screen as the solo profile, whose ⋯ menu adds «Настройки пары».

## 2026-10-22 — Profile editor rhythm

- Profile editor (solo and couple): «Данные о тебе / Данные пары» is a card in the same style as «Данные» on the profile; the city is a bordered select (pin, value, chevron) like the other inputs.
- No dividers inside the main editor card: toggles, fields, the city select and the details card share one 16px rhythm.
- Couple settings (Q01): sections use the standard group (title 8px above its card) instead of grid rows, so the title-to-card gap matches every other screen.

## 2026-10-22 — Couple details from personal profiles, couple search

- A couple's gender, orientation and age are no longer stored on the couple: they come from each member's own profile, only what that member shows publicly (hidden age stays hidden). Seed couples without member accounts carry the same public data per member.
- «Данные пары» on the profile lists each member («Lena — женщина, би, 31») before role, format and «Ищу». The couple editor shows the same rows read-only («Из личных профилей») with a link to edit your own profile.
- Discover filters now apply to couples (owner decision): gender and orientation — at least one member matches; age — every member with a shown age is inside the range.

## 2026-10-22 — Couple members, defaults on creation

- «Участники» on a couple profile shows each member's own gender and orientation (and age if shown) instead of «личный профиль»; long lists clamp to two lines, the full list is on the member's profile. «Данные пары» keeps only the couple's own role, format and «Ищу».
- Seed couples read member data from their member profiles (Lena 31 woman bi, Max 34 man hetero; Nika 29, Jonas 31, both bi).
- A new couple is shown in Discover by default; it appears once there is a couple photo. Saving the couple profile without a photo is allowed; turning Discover back on needs 18+ confirmation of both partners.
- Creating a couple and the invitation sheet explain the defaults: shown in Discover, either partner edits and changes show at once with a notification, approval is opt-in per partner in couple settings, hiding from Discover and closing the private part are always immediate.

## 2026-10-22 — Profile editor chips, «В поиске»

- Chips in «Данные о тебе / Данные пары» no longer jump: the card no longer folds itself after the first pick (its open state is fixed per visit), and the summary above the chips is shown only while the card is folded — it never changes height under your finger.
- The folded summary lists every chosen value of every field (it used to cut to two values and three fields).
- Section titles inside the details card («Из личных профилей», «Роль», «Формат отношений», «В поиске») are bolder and in the primary text colour.
- «Ищу» / «Что ищет» / «Что ищем» → «В поиске» everywhere in V12 (profile, couple details, Discover filters, couple change review) — reads correctly for one person and for a couple.
- Folded details summary (solo and couple): one line per field — the field name («Гендер», «Ориентация», …) bold in the primary text colour, the chosen values muted after it.
- Owner: the titles above the chips inside the details card are back to the standard field-label style (the bold/primary-colour variant is reverted); only the folded summary keeps bold field names.

## 2026-10-22 — Found while walking the couple approval flows

- Toasts raised right before navigating back (e.g. «Изменения отправлены партнёру на подтверждение», «Профиль обновлён» after «Сохранить») were wiped by the history-driven back render a moment later. A toast younger than 1 s now survives that render.
- An untouched couple draft (the partner only opened the couple editor or interests) no longer blocks turning «Показывать пару в знакомствах» back on.
- The couple interests screen is titled «Интересы пары» (was «Мои интересы»).

## 2026-10-22 — Sent back for changes, simpler approvals

- «Вернуть на доработку» (profile, joint post, private access) opens one small sheet with an optional note («Что поправить»). The note shows in the notification, the inbox row, couple settings, the editor banner and the review sheet.
- The sender sees a returned version as something to do: it lands in «Нужно решить», couple settings show «Вернули на доработку», the Profiles card says «Изменения вернули на доработку», the couple editor opens with a banner. Actions: rework (edit profile / edit post / change the access decision) or discard («Отменить изменения / публикацию / решение»).
- Access no longer dead-ends: «Изменить решение» reopens the grant sheet (new version), «Отменить решение» puts the request back in «Нужно решить». A couple request already answered is not offered twice while it waits.
- Couple notifications have real text for every event (no more «Новое уведомление»).
- Profile and interests are one approval: the review sheet no longer lists changed fields — «<имя> предлагает изменения профиля пары», «Посмотреть профиль», «Одобрить / Вернуть на доработку». Less linked data to maintain.
- «Моё подтверждение»: one question, two choices as a list with a short subtitle each, one short note; the long paragraph is gone.
- «Моё подтверждение» names all three kinds of couple actions in the question: profile changes, posts and private access.
