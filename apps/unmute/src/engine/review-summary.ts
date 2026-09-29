import type { CardSrsState } from './card-srs';
import { buildPracticeReviewQueue } from './practice-queue';
import type { PracticeSrsState } from './practice-srs';
import { wordReviewSession } from './word-srs';
import type { WordsProgressDocument } from '../progress';

export const CARD_REVIEW_SESSION_CAP=30;

export interface CardReviewQueue {
  dueIds:string[];
  totalDue:number;
  waiting:number;
}

export interface ReviewSummary{
  cards:CardReviewQueue;
  practice:ReturnType<typeof buildPracticeReviewQueue>;
  words:ReturnType<typeof wordReviewSession>;
  actionableCount:number;
  waitingCount:number;
}

export function selectCardReviewQueue(
  cardIds:string[],
  cards:Record<string,(CardSrsState&{deleted?:boolean})|undefined>,
  todayDay:number
):CardReviewQueue{
  const sourceOrder=new Map(cardIds.map((id,index)=>[id,index]));
  const allCards=cardIds
    .filter(id=>{
      const state=cards[id];
      return Boolean(state&&!state.deleted&&state.due<=todayDay);
    })
    .sort((a,b)=>{
      const dueA=cards[a]?.due??0;
      const dueB=cards[b]?.due??0;
      return dueA-dueB||(sourceOrder.get(a)??0)-(sourceOrder.get(b)??0);
    });
  const dueIds=allCards.slice(0,CARD_REVIEW_SESSION_CAP);
  return {
    dueIds,
    totalDue:allCards.length,
    waiting:Math.max(0,allCards.length-CARD_REVIEW_SESSION_CAP),
  };
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
  const cards=selectCardReviewQueue(input.cardIds,input.cards,todayDay);
  const practice=buildPracticeReviewQueue(input.practiceIds,input.practice,todayDay);
  const words=wordReviewSession(input.words,todayDay);

  return {
    cards,
    practice,
    words,
    actionableCount:cards.dueIds.length+practice.dueCount+words.items.length,
    waitingCount:
      cards.waiting+
      practice.waitingCount+
      words.waiting,
  };
}
