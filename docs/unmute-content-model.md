# UnMute content model

Status: accepted 2026-09-28. This is the contract for Phase 3 import and the future content constructor.

## Product model

- There is no global learner CEFR level that gates the app.
- The catalog contains independent **sets**. A learner can own and study multiple sets in parallel.
- Each set has its own roadmap and progress. Example sets: A1→B1, B1→B2, Travel, Work, Speaking.
- The current legacy English Trainer becomes the first set. Its exact marketing name can change without changing its stable set id.
- A paid set may expose a free preview. For the first set the preview is **days 1–7 inclusive**.
- A “day” is a product attribute (`dayIndex`), not the array position. Checkpoints/reviews inserted between days do not consume free days.
- Anything already learned in the free area remains available for repetition/review forever.

## Roadmap

A roadmap is a graph of nodes, not a hard-coded 40-element array.

Each node has:
- stable `id`;
- `kind` (lesson/practice/review/dialogue/checkpoint/bonus);
- visual `order`;
- optional `dayIndex`;
- `prerequisites`;
- references to `activityIds`.

This supports a linear Duolingo-like path now and branches/bonus paths later without changing the data model.

## Activities

Activities are independent reusable content objects. A node references them by stable ID rather than embedding them by position.

Initial types:
- theory
- choice
- text-input
- translation
- speaking
- pattern-drill
- dialogue
- listening
- review
- ai-conversation

Adding a new type extends the activity schema and renderer; it does not require rewriting roadmaps or progress.

## Editing and revisions

Never identify progress by array position (the legacy `lesson#3` model is not allowed).

Every activity has:
- stable `id`;
- integer `revision`;
- `revisionProgress: preserve | reset`.

Minor copy/explanation fixes keep the ID and set `preserve`. A materially different task increments the revision and normally uses `reset`. The future constructor must make this an explicit publish choice rather than silently destroying progress.

Sets also have their own revision and schema version. Published content is validated before release.

## Constructor requirement

The future Admin content constructor must operate on this exact model:
1. create/edit a set;
2. create one or more roadmaps;
3. add/reorder/connect nodes;
4. create/edit/reuse activities;
5. preview free/paid access;
6. validate dangling references and schema errors;
7. publish a new content revision;
8. explicitly choose progress compatibility for materially changed activities.

The legacy import is only a producer of this model. Legacy JavaScript structures must not become the new source of truth.
