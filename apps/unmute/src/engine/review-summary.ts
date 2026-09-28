import type { CardSrsState } from './card-srs';
import { buildPracticeReviewQueue } from './practice-queue';
import type { PracticeSrsState } from './practice-srs';
import { wordReviewSession } from './word-srs';
import type { WordsProgressDocument } from '../progress';

export const CARD_REVIEW_SESSION_CAP=30;

export interface ReviewSummary{
  cards:{
    dueIds:string[];
    totalDue:number;
    waiting:number;
  };
  practice:ReturnType<typeof buildPracticeReviewQueue>;
  words:ReturnType<typeof wordReviewSession>;
  actionableCount:number;
  waitingCount:number;
}

export function buildReviewSummary(
  input:{
    cardIds:string[];
    cards:Record<string,CardSrsState|undefined>;
    practiceIds:string[];
    practice:{
      drill:Record<string,PracticeSrsState|undefined>;
      listening:Record<string,PracticeSrsState|undefined>;
      speaking:Record<string,PracticeSrsState|undefined>;
    };
    words:WordsProgressDocument;
  },
  todayDay:number
):ReviewSummary{
  const sourceOrder=new Map(input.cardIds.map((id,index)=>[id,index]));
  const allCards=input.cardIds
    .filter(id=>Boolean(input.cards[id]&&input.cards[id]!.due<=todayDay))
    .sort((a,b)=>{
      const dueA=input.cards[a]?.due??0;
      const dueB=input.cards[b]?.due??0;
      return dueA-dueB||(sourceOrder.get(a)??0)-(sourceOrder.get(b)??0);
    });
  const cardDue=allCards.slice(0,CARD_REVIEW_SESSION_CAP);
  const practice=buildPracticeReviewQueue(input.practiceIds,input.practice,todayDay);
  const words=wordReviewSession(input.words,todayDay);

  return {
    cards:{
      dueIds:cardDue,
      totalDue:allCards.length,
      waiting:Math.max(0,allCards.length-CARD_REVIEW_SESSION_CAP),
    },
    practice,
    words,
    actionableCount:cardDue.length+practice.dueCount+words.items.length,
    waitingCount:
      Math.max(0,allCards.length-CARD_REVIEW_SESSION_CAP)+
      practice.waitingCount+
      words.waiting,
  };
}
