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

/** Drop a word from «Мои слова» with every meaning saved for it. */
export async function removeSavedWord(lexemeId: string): Promise<void> {
  const current = await readWordsProgress();
  const saved = Object.values(current.items).filter(record => record && !record.deleted && record.lexemeId === lexemeId);
  for(const record of saved) await setWordSaved(lexemeId, record!.senseId, false);
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
  /** A word counts as saved when any of its meanings is in «Мои слова». */
  const isWordSaved = useCallback((lexemeIds: string[]) => {
    const items = query.data?.items ?? {};
    return Object.values(items).some(record => record && !record.deleted && lexemeIds.includes(record.lexemeId));
  }, [query.data]);
  /** One button per word: saving keeps its main meaning, removing drops every saved meaning. */
  const toggleWord = useCallback(async (lexemeId: string, senseId: string, lexemeIds: string[], save: boolean) => {
    if(save){
      await setWordSaved(lexemeId, senseId, true);
    }else{
      for(const id of lexemeIds) await removeSavedWord(id);
    }
    await queryClient.invalidateQueries({queryKey:[WORDS_KEY], exact:true});
  }, [queryClient]);
  return {words:query.data ?? null, isSaved, toggle, isWordSaved, toggleWord};
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
  // One row per word, even if several of its meanings were saved earlier.
  const byWord = new Map<string, SavedWord>();
  for(const [key, record] of Object.entries(words.items)){
    if(!record || record.deleted) continue;
    const lexeme = byId.get(record.lexemeId);
    if(!lexeme || !lexeme.senses.length) continue;
    const translations = [...new Set(lexeme.senses.flatMap(sense =>
      (sense.translations[locale] || sense.translations.ru || Object.values(sense.translations)[0] || []).slice(0, 2)))].slice(0, 4);
    const item: SavedWord = {key, record, lemma:lexeme.lemma, translation:translations.join(', '), status:savedWordStatus(record.box || 0)};
    const existing = byWord.get(lexeme.id);
    if(!existing || record.at > existing.record.at) byWord.set(lexeme.id, item);
  }
  return [...byWord.values()].sort((a, b) => b.record.at.localeCompare(a.record.at) || a.lemma.localeCompare(b.lemma));
}
