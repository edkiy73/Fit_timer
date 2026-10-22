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
