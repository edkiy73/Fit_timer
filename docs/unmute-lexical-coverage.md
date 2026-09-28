# UnMute lexical coverage architecture

Status: accepted foundation for Phase 3. This document replaces the idea that the legacy 577-word mini-dictionary is the scope of the new dictionary.

## Product requirement

Every English word that UnMute intentionally renders as learner content must be tappable and must resolve deterministically.

The old application made almost every rendered English token clickable with `ttsify()`. Its word sheet could show:
- clicked surface word;
- translation;
- IPA;
- Russian learner pronunciation hint;
- TTS playback;
- translation of the surrounding phrase/sentence when known;
- up to two other examples;
- add/remove from the learner's personal review vocabulary.

The old app also had:
- a grouped Phrase Bank;
- an irregular-verb table;
- RU reveal for phrase lists.

These are product features, not legacy implementation details, and must survive the migration.

## What was wrong with the legacy resolver

The old resolver:
- guessed lemmas with regex suffix stripping;
- guessed inflected forms;
- searched examples dynamically by textual similarity;
- searched phrase translations by normalized raw strings;
- stored personal vocabulary as `surface -> one Russian translation`.

This can attach a translation/example to the wrong sense and can silently replace a previous meaning.

The new resolver never invents a lexical identity.

## Source-of-truth model

Global DB lexicon:

`Lexeme -> explicit forms -> senses -> examples`

A set references this global lexicon. It does not own duplicate dictionary entries.

A phrase/collocation/phrasal verb is also a lexical entry. Multi-word entries are first-class and may have senses/examples just like a word.

### Stable learner identity

Personal vocabulary progress is keyed by:

`lexemeId + senseId`

Never by visible word text, array position, or translation string.

## Published-content coverage contract

A content release is publishable only when the lexical audit passes the configured policy.

For every user-visible English surface in the set, the audit records:
- normalized surface;
- count;
- source activity IDs;
- context snippets;
- matching lexeme IDs;
- whether it has explicit pronunciation;
- whether the occurrence is pinned to a sense;
- whether the current surrounding multi-word expression is known.

Coverage categories:
- `resolved`: exact explicit form -> one lexeme;
- `ambiguous`: exact explicit form -> multiple lexemes and no occurrence pin;
- `missing`: no explicit form in the lexicon;
- `missing-pronunciation`;
- `missing-context`: a polysemous word is not pinned where the meaning matters.

No runtime stemming is used to turn `worked` into `work`. The form `worked` must exist explicitly on the `work` lexeme.

## Click resolver

Resolution order for a tap:

1. Exact activity occurrence annotation (`lexemeId` + optional `senseId`) when present.
2. Longest matching explicit multi-word expression containing that occurrence.
3. Exact explicit surface-form lookup.
4. If several candidates remain, show choices/senses. Never silently choose one.
5. A published course should normally have no `missing` clickable surfaces. If a runtime-only text source creates an unknown word, show a safe “dictionary data is not ready for this word” state plus TTS rather than inventing data.

## Word sheet

For a resolved occurrence the sheet can contain:
- surface + lemma;
- part of speech;
- Russian translations for the selected sense;
- US IPA;
- optional Russian learner reading;
- TTS;
- surrounding phrase/collocation with translation when the occurrence is part of one;
- examples bound to the selected sense;
- personal-vocabulary toggle.

If the occurrence is ambiguous, the sheet first shows the candidate senses/lexemes and lets the learner choose.

## Phrase and verb resources

The legacy Phrase Bank and irregular verbs are not encoded as random UI constants.

A set can expose reference resources that point into the global lexicon:
- `phrase-collection`: grouped phrase/collocation lexeme+sense references;
- `verb-table`: lemma + explicit inflected forms.

This lets future sets have their own phrase banks without duplicating dictionary data.

## Bulk enrichment instead of one-by-one editing

Single-entry editing exists for corrections, not for filling a dictionary.

The normal workflow is:

1. Build coverage report from the current draft set.
2. Select 50–100 missing/ambiguous items.
3. Admin generates a deterministic AI prompt containing:
   - surfaces;
   - real course contexts;
   - existing lexeme matches when any;
   - required output schema.
4. Run that prompt in ChatGPT/another model manually.
5. Paste the result into Admin.
6. Validate format and references.
7. Preview adds/updates/conflicts.
8. Apply to lexicon draft.
9. Re-run coverage.

No model API is required for this workflow.

## AI paste format

Human/AI-facing input is intentionally simpler than the internal DB schema:

```json
{
  "format": "unmute.lexicon.patch.v1",
  "entries": [
    {
      "lexemeId": "lex.work",
      "lemma": "work",
      "forms": [
        {"text": "work", "kind": "lemma", "ipa": "wɝːk", "ruReading": "уёрк"},
        {"text": "works", "kind": "inflection", "ipa": "wɝːks", "ruReading": "уёркс"},
        {"text": "worked", "kind": "inflection", "ipa": "wɝːkt", "ruReading": "уёркт"},
        {"text": "working", "kind": "inflection", "ipa": "ˈwɝːkɪŋ", "ruReading": "уёркинг"}
      ],
      "senses": [
        {
          "id": "verb",
          "partOfSpeech": "verb",
          "translations": ["работать"],
          "examples": [
            {"en": "I work from home.", "ru": "Я работаю из дома."}
          ]
        }
      ]
    }
  ]
}
```

Pronunciation belongs to the exact surface form when forms differ: the IPA for `worked` must describe `worked`, not `work`. A lexeme-level pronunciation remains only as a fallback/default.

The server converts this into the strict internal schema and preserves stable IDs/revisions. Existing curated pronunciation is never silently replaced by an AI patch. Polysemous existing entries are not auto-merged into a guessed sense. AI is never allowed to overwrite a published release directly.

The Admin workflow is deliberately API-free: generate a prompt for 25/50/100 missing surfaces, copy it to a model, paste the JSON answer, Preview, then Apply to draft. A batch is atomic at the lexicon-workspace pointer: conflicts block the apply rather than partially changing the draft.

## Pronunciation bootstrap

Use a pinned snapshot of `open-dict-data/ipa-dict` US English as a pronunciation enrichment source.

Pinned source commit:
`43c3570eb3553bdd19fccd2bd0091534889af023`

Only the fields needed by the current UnMute lexicon are imported into the DB; the full external dictionary is not shipped inside the app bundle.

Russian learner readings remain optional and can be bulk-generated/reviewed through the AI paste workflow.

## Examples

Examples are sense-bound data. They can come from:
- exact translated course examples;
- manual/editor input;
- AI paste batches.

The old dynamic “find any sentence containing a similar-looking form” algorithm is permanently forbidden.

## Future AI-generated text

When live AI conversations are enabled, generated learner-facing text must either:
- return lexical annotations together with the response; or
- pass through the same resolver/enrichment pipeline before being considered fully dictionary-covered.

This keeps the click behavior deterministic even outside authored lessons.
