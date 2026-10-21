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
