# UnMute learner progress model

Canonical learner state is local-first and syncs for free. Course content lives in the content database; learner progress stores only stable references to that content.

## Documents

### `progress:course:<setId>`

One independent document per purchased/active course set.

Stores:
- seen activity IDs;
- card SRS state by stable activity ID;
- practice SRS by stable pattern activity ID and mode:
  - `drill`
  - `listening`
  - `speaking`
- manually completed roadmap nodes (review-only days);
- learning-day records used to derive streak/activity history.

It never stores legacy `lessonId#index` identities.

### `progress:stats:<setId>`

Answer statistics for one set.

Counters are stored in per-device + activity buckets. This prevents two devices from replacing each other's counters during offline use. UI totals, accuracy and weak spots are aggregates over all live buckets.

Weak-spot compatibility with legacy:
- at least 2 attempts;
- error rate >= 34%;
- highest error rate first;
- then highest wrong-answer count.

### `progress:words`

Global across all sets because the lexicon is global.

A saved vocabulary item is identified by `lexemeId + senseId`, not visible word text. This is required so homographs and different meanings do not overwrite each other.

Example:
- `read /riːd/` and `read /rɛd/` can point to distinct lexicon forms/senses;
- noun and verb senses of the same spelling can be saved independently.

Removal is a tombstone, so a word deleted on one device does not reappear after syncing with another device.

Legacy personal-word SRS is preserved:
- first review: tomorrow;
- intervals after grading: `[0, 2, 6, 16, 35]`;
- max box: 4;
- wrong answer: box 0, due today;
- one review session: max 20 words.

## Conflict merge

Documents are not whole-document last-write-wins.

Every mutable record has an ISO `at` timestamp. Records merge independently:
- newer record wins;
- on equal timestamps, deletion wins;
- unrelated records from two devices are retained.

This applies to card SRS, practice SRS, seen activities, manual nodes, learning days, word review records and stats buckets.

## Review summary

The engine exposes one aggregate review summary:
- cards: oldest due first, max 30 per session;
- drill: max 3 per day;
- speaking: max 2 per day;
- listening: max 2 per day;
- personal words: max 20 per session;
- separate actionable and waiting counts.

The UI should consume this summary rather than rebuilding queue rules.

## Legacy import

Phase 5 import from `eng-trainer-v2` maps old data into these canonical documents:
- `srs` -> stable card activity IDs;
- `pat` -> `practice.drill`;
- `lis` -> `practice.listening`;
- legacy `voc` -> `practice.speaking` (despite the old misleading name);
- `rest` -> manual roadmap node completion;
- `err/total/right` -> stats buckets;
- `words` -> lexicon-backed `lexemeId+senseId` word records;
- `day/streak/act` -> learning-day history where reconstructable.

Ambiguous legacy word strings must not be guessed silently: import should resolve through the lexicon and surface unresolved/ambiguous cases for review.
