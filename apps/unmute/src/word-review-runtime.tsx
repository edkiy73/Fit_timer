import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadLexicon } from './lexicon/client';
import type { LexiconSnapshot } from './lexicon/schema';
import { WORD_PROGRESS_DOC, type WordsProgressDocument } from './progress';
import { appDocs, readWordsProgress } from './sync';

const WORDS_KEY='word-review-progress';
const LEXICON_KEY='word-review-lexicon';

export interface WordReviewRuntimeValue {
  words:WordsProgressDocument|null;
  lexicon:LexiconSnapshot|null;
  status:'pending'|'ready'|'error';
  error:unknown;
  fromCache:boolean;
  refresh:()=>Promise<void>;
}

export function useWordReviewRuntime():WordReviewRuntimeValue{
  const queryClient=useQueryClient();
  const wordsQuery=useQuery({
    queryKey:[WORDS_KEY],
    queryFn:readWordsProgress,
    staleTime:Infinity,
  });
  const lexiconQuery=useQuery({
    queryKey:[LEXICON_KEY],
    queryFn:loadLexicon,
    staleTime:5*60_000,
  });

  useEffect(()=>{
    return appDocs.subscribe(change=>{
      if(!change.keys.some(ref=>ref.key===WORD_PROGRESS_DOC))return;
      void queryClient.invalidateQueries({queryKey:[WORDS_KEY],exact:true});
    });
  },[queryClient]);

  const refresh=async()=>{
    await Promise.all([
      queryClient.invalidateQueries({queryKey:[WORDS_KEY],exact:true}),
      queryClient.invalidateQueries({queryKey:[LEXICON_KEY],exact:true}),
    ]);
  };

  const error=wordsQuery.error ?? lexiconQuery.error ?? null;
  const status:error extends never ? never : 'pending'|'ready'|'error' = error
    ? 'error'
    : wordsQuery.data&&lexiconQuery.data
      ? 'ready'
      : 'pending';

  return useMemo(()=>({
    words:wordsQuery.data??null,
    lexicon:lexiconQuery.data?.lexicon??null,
    status,
    error,
    fromCache:Boolean(lexiconQuery.data?.fromCache),
    refresh,
  }),[
    wordsQuery.data,
    lexiconQuery.data,
    status,
    error,
  ]);
}
