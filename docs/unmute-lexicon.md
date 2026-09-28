# UnMute shared lexicon

The lexicon is global to the application, not owned by a single course set.

## Why the legacy dictionary is replaced

The legacy implementation keyed translations by surface text and tried to guess stems/forms at runtime. Examples were mined dynamically from all course text. This can attach a wrong translation or unrelated example to a clicked word.

The new model never guesses a meaning.

## Model

`Lexeme → forms → senses → examples`

A lexeme has a stable id and lemma. Every accepted surface form is explicit. A sense has its own stable id and translations. Every example points to exactly one sense.

Example:

- lexeme `work`
  - forms: work, works, worked, working
  - sense `verb`: работать
    - example: I work from home. → Я работаю из дома.
  - sense `noun`: работа, труд
    - example: I have a lot of work. → У меня много работы.

A different lexeme may legally share the same surface form. Lookup then returns all candidates unless the course activity explicitly provides `lexemeId/senseId` context. The UI must not silently choose one.

## Rules

1. No regex stemming or invented forms at runtime.
2. No dynamic example mining from unrelated course text.
3. No `word → translation string` state.
4. Personal vocabulary progress is keyed by `lexemeId + senseId`.
5. Editing a translation never changes that progress identity.
6. Examples have stable IDs and are bound to one sense.
7. Course activities may provide explicit dictionary context for a word occurrence; explicit context wins over surface lookup.
8. If context is ambiguous, display the alternatives instead of guessing.
9. Lexicon is DB-backed and versioned with `draft → validate → immutable publish revision`.
10. Client caches the last published snapshot for offline lookup.

## Course-set relationship

Sets may reference lexeme/sense IDs but do not own dictionary data. One lexeme can be used by any number of sets (A1→B1, B1→B2, Travel, Work, etc.).

Legacy import will create lexemes/senses/forms/examples once, then course import will reference them.


## Admin editing

The Admin edits the lexicon draft only. Published users keep seeing the current paired release until an explicit Publish.

- Each lexeme has its own revision.
- Saving requires the revision the editor opened; a stale editor gets `lexeme_revision_conflict` instead of overwriting a newer edit.
- `needs-review` is removed only by an explicit reviewed save.
- A sense may be added or removed; validation prevents deleting a sense while examples still reference it.
- Re-running the legacy import cannot silently replace a manually edited draft; overwrite must be explicit.
