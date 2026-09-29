import type { LexiconSnapshot } from './lexicon/schema';
import type { WordProgressRecord, WordsProgressDocument } from './progress';
import { dueWords, WORD_SESSION_CAP } from './engine/word-srs';

export interface ResolvedWordReviewItem {
  record:WordProgressRecord;
  lemma:string;
  translations:string[];
}

export interface ResolvedWordReviewSession {
  items:ResolvedWordReviewItem[];
  totalDue:number;
  waiting:number;
  unresolved:number;
}

export function resolveWordReviewSession(
  words:WordsProgressDocument,
  lexicon:LexiconSnapshot,
  todayDay:number,
  locale:string
):ResolvedWordReviewSession{
  const byId=new Map(lexicon.entries.map(entry=>[entry.id,entry]));
  const resolved:ResolvedWordReviewItem[]=[];
  let unresolved=0;

  for(const record of dueWords(words,todayDay)){
    const lexeme=byId.get(record.lexemeId);
    const sense=lexeme?.senses.find(item=>item.id===record.senseId);
    if(!lexeme||!sense||lexeme.deprecated){
      unresolved++;
      continue;
    }
    const translations=
      sense.translations[locale] ||
      sense.translations.ru ||
      Object.values(sense.translations)[0] ||
      [];
    if(!translations.length){
      unresolved++;
      continue;
    }
    resolved.push({
      record,
      lemma:lexeme.lemma,
      translations,
    });
  }

  return {
    items:resolved.slice(0,WORD_SESSION_CAP),
    totalDue:resolved.length,
    waiting:Math.max(0,resolved.length-WORD_SESSION_CAP),
    unresolved,
  };
}
