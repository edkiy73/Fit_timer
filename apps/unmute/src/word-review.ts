import type { LexiconSnapshot } from './lexicon/schema';
import type { WordProgressRecord, WordsProgressDocument } from './progress';
import { wordReviewSession } from './engine/word-srs';

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
  const session=wordReviewSession(words,todayDay);
  const byId=new Map(lexicon.entries.map(entry=>[entry.id,entry]));
  const items:ResolvedWordReviewItem[]=[];
  let unresolved=0;

  for(const record of session.items){
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
    items.push({
      record,
      lemma:lexeme.lemma,
      translations,
    });
  }

  return {
    items,
    totalDue:session.totalDue,
    waiting:session.waiting,
    unresolved,
  };
}
