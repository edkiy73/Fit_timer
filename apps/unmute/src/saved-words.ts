import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LexiconSnapshot } from './lexicon/schema';
import type { WordProgressRecord, WordsProgressDocument } from './progress';
import { readWordsProgress, writeWordsProgress } from './sync';
import { addWordToReview, removeWordFromReview } from './engine/word-srs';
import { activitySaveClock } from './activity-progress';

/** Query key of the local «Мои слова» document (shared with the word review runtime). */
export const WORDS_KEY = 'word-review-progress';

export const savedWordKey = (lexemeId: string, senseId: string) => lexemeId + '|' + senseId;

/** Save or drop a dictionary sense from «Мои слова» (the personal word review queue). */
export async function setWordSaved(lexemeId: string, senseId: string, save: boolean): Promise<void> {
  const clock = activitySaveClock();
  const current = await readWordsProgress();
  const next = save
    ? addWordToReview(current, lexemeId, senseId, clock.dayNumber, clock.at)
    : removeWordFromReview(current, lexemeId, senseId, clock.at);
  if(next !== current) await writeWordsProgress(next);
}

export function useSavedWords(){
  const queryClient = useQueryClient();
  const query = useQuery({queryKey:[WORDS_KEY], queryFn:readWordsProgress, staleTime:Infinity});
  const isSaved = useCallback((lexemeId: string, senseId: string) => {
    const record = query.data?.items[savedWordKey(lexemeId, senseId)];
    return Boolean(record && !record.deleted);
  }, [query.data]);
  const toggle = useCallback(async (lexemeId: string, senseId: string, save: boolean) => {
    await setWordSaved(lexemeId, senseId, save);
    await queryClient.invalidateQueries({queryKey:[WORDS_KEY], exact:true});
  }, [queryClient]);
  return {words:query.data ?? null, isSaved, toggle};
}

export type SavedWordStatus = 'new' | 'learning' | 'learned';

export interface SavedWord {
  key: string;
  record: WordProgressRecord;
  lemma: string;
  translation: string;
  status: SavedWordStatus;
}

/** Box 0 = just saved, 1–3 = in review, 4 = the longest interval reached. */
export function savedWordStatus(box: number): SavedWordStatus {
  if(box >= 4) return 'learned';
  return box > 0 ? 'learning' : 'new';
}

/** Every live saved word the current dictionary can still resolve, newest first. */
export function listSavedWords(words: WordsProgressDocument, lexicon: LexiconSnapshot, locale: string): SavedWord[]{
  const byId = new Map(lexicon.entries.map(entry => [entry.id, entry]));
  const result: SavedWord[] = [];
  for(const [key, record] of Object.entries(words.items)){
    if(!record || record.deleted) continue;
    const lexeme = byId.get(record.lexemeId);
    const sense = lexeme?.senses.find(item => item.id === record.senseId) || lexeme?.senses[0];
    if(!lexeme || !sense) continue;
    const translations = sense.translations[locale] || sense.translations.ru || Object.values(sense.translations)[0] || [];
    result.push({key, record, lemma:lexeme.lemma, translation:translations.join(', '), status:savedWordStatus(record.box || 0)});
  }
  return result.sort((a, b) => b.record.at.localeCompare(a.record.at) || a.lemma.localeCompare(b.lemma));
}
