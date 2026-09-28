# UnMute learner progress model

Canonical learner state is local-first and syncs for free. Course content lives in the content database; learner progress stores only stable references to published content.

## Documents

### `progress:course:<setId>`

One independent document per course set.

Stores:
- seen activity IDs;
- card SRS state by stable activity ID;
- practice SRS by stable pattern activity ID and semantic mode: `drill`, `listening`, `speaking`;
- manually completed roadmap nodes, including review-only days;
- learning-day records;
- course metrics such as imported dialogue score or speed.

It never uses legacy `lessonId#index` as runtime identity.

### `progress:stats:<setId>`

Answer statistics for one set.

Counters are stored in per-device + activity buckets, so offline work on two devices is merged instead of one device replacing the other's counters.

Weak spots preserve legacy behavior:
- at least 2 attempts;
- error rate >= 34%;
- highest error rate first;
- then highest wrong-answer count.

### `progress:words`

Global across all sets because the lexicon is global.

A saved word is identified by `lexemeId + senseId`, never by visible word text. Different meanings of the same spelling therefore cannot overwrite each other.

Removal is a tombstone, so a word removed on one device cannot silently reappear after another device syncs.

Legacy personal-word SRS is preserved:
- first review tomorrow;
- intervals `[0, 2, 6, 16, 35]`;
- max box 4;
- wrong answer -> box 0, due today;
- max 20 words in one review session.

## Conflict merge

Progress is not whole-document last-write-wins.

Every mutable record carries an ISO `at` timestamp. Records merge independently:
- newer record wins;
- on equal timestamps deletion wins;
- unrelated records from two devices survive together.

This applies to card SRS, practice SRS, seen activities, manual nodes, learning days, metrics, personal words and stats buckets.

## Review summary

The engine exposes one aggregate review summary:
- cards: oldest due first, max 30 per session;
- drill: max 3;
- speaking: max 2;
- listening: max 2;
- personal words: max 20;
- separate actionable and waiting counts.

UI must consume this summary instead of rebuilding queue rules.

## Legacy progress migration

The frozen legacy source is `edkiy73/English@011572be908d64a1e092e63a821e407d85753205`.

`eng-trainer-v2` maps to canonical state:
- `srs` -> stable card activity IDs;
- `pat` -> `practice.drill`;
- `lis` -> `practice.listening`;
- legacy `voc` -> `practice.speaking` (the old name was misleading);
- `rest` -> manual roadmap node completion;
- `err/total/right` -> stats/report;
- `words` -> lexicon-backed `lexemeId+senseId` records;
- `dia/ai/speed` -> seen activities and metrics where resolvable;
- `day/streak/act` -> learning-day history where reconstructable.

Legacy word strings are resolved through the global lexicon. Ambiguous words or senses are never guessed silently; migration reports them as unresolved for review.

Legacy due-day values are corrected for the old local-midnight calculation before being written into the canonical UTC day-number scheme.
