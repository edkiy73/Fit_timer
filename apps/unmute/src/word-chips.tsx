import { useLayoutEffect, useMemo, useRef } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { MOTION, MOTION_EASING, prefersReducedMotion } from './motion';

/* «Собери фразу»: the answer's words plus a few from other answers of the lesson, shuffled.
   The learner taps words into the line (tap again to take one back). New phrases start here;
   once a phrase has been answered before, it is typed from the keyboard. */

export interface Chip { id: string; text: string }

const EDGE_PUNCT = /^[.,!?;:"«»()]+|[.,!?;:"«»()]+$/g;
const MAX_WORDS = 10;

// Words keep their case: names stay «Anna», and the capital of the first word is a fair hint.
function chipWord(token: string): string {
  return token.replace(EDGE_PUNCT, '');
}

function hash(value: string): number {
  let h = 2166136261;
  for(let i = 0; i < value.length; i++){ h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Words of the answer, or null when the phrase is too short or too long for chips. */
export function answerWords(answer: string): string[] | null {
  const words = answer.split(/\s+/).map(chipWord).filter(Boolean);
  return words.length >= 2 && words.length <= MAX_WORDS ? words : null;
}

/** The chip set: answer words + up to 3 words from other answers, in a stable shuffled order. */
export function buildChips(seed: string, answer: string, otherAnswers: string[]): Chip[] {
  const words = answerWords(answer) ?? [];
  const own = new Set(words.map(word => word.toLowerCase()));
  const pool = [...new Set(otherAnswers.flatMap(other => other.split(/\s+/).map(chipWord)))]
    .filter(word => word && !own.has(word.toLowerCase()) && /^[A-Za-z']+$/.test(word));
  pool.sort((a, b) => hash(seed + a) - hash(seed + b));
  const all = [...words, ...pool.slice(0, 3)].map((text, index) => ({id:String(index), text}));
  return all.sort((a, b) => hash(seed + '|' + a.id + a.text) - hash(seed + '|' + b.id + b.text));
}

export function WordChips({chips, picked, disabled, onChange}: {
  chips: Chip[];
  picked: string[];
  disabled?: boolean;
  onChange: (picked: string[]) => void;
}){
  const {t} = useI18n();
  const byId = useMemo(() => new Map(chips.map(chip => [chip.id, chip])), [chips]);
  const pickedRefs=useRef(new Map<string,HTMLButtonElement>());
  const poolRefs=useRef(new Map<string,HTMLButtonElement>());
  const pendingMove=useRef<{id:string;from:DOMRect}|null>(null);

  const move=(id:string,from:HTMLButtonElement|null,next:string[])=>{
    if(from)pendingMove.current={id,from:from.getBoundingClientRect()};
    onChange(next);
  };

  useLayoutEffect(()=>{
    const pending=pendingMove.current;
    if(!pending)return;
    pendingMove.current=null;
    if(prefersReducedMotion())return;
    const target=picked.includes(pending.id)
      ? pickedRefs.current.get(pending.id)
      : poolRefs.current.get(pending.id);
    if(!target||typeof target.animate!=='function')return;
    const to=target.getBoundingClientRect();
    const dx=pending.from.left-to.left;
    const dy=pending.from.top-to.top;
    const sx=to.width?pending.from.width/to.width:1;
    const sy=to.height?pending.from.height/to.height:1;
    target.animate(
      [
        {transform:`translate(${dx}px,${dy}px) scale(${sx},${sy})`,opacity:.72},
        {transform:'translate(0,0) scale(1)',opacity:1}
      ],
      {duration:MOTION.spring,easing:MOTION_EASING.standard}
    );
  },[picked]);

  return (
    <div className="chips-builder">
      <span className="chips-label">{t('learn.answerLabel')}</span>
      <div className={'chips-line' + (picked.length ? '' : ' is-empty')} aria-label={t('chips.line')} aria-live="polite">
        {picked.length === 0 && <span className="chips-placeholder">{t('chips.placeholder')}</span>}
        {picked.map(id => (
          <button key={id} type="button" className="word-chip is-picked pressable" disabled={disabled}
            ref={element=>{if(element)pickedRefs.current.set(id,element);else pickedRefs.current.delete(id);}}
            aria-label={t('chips.remove', {word:byId.get(id)?.text ?? ''})}
            onClick={event=>move(id,event.currentTarget,picked.filter(item => item !== id))} lang="en">
            {byId.get(id)?.text}
          </button>
        ))}
      </div>
      <div className="chips-pool" aria-label={t('chips.pool')}>
        {chips.map(chip => {
          const used = picked.includes(chip.id);
          if(used)return null;
          return (
            <button key={chip.id} type="button" className="word-chip pressable"
              ref={element=>{if(element)poolRefs.current.set(chip.id,element);else poolRefs.current.delete(chip.id);}}
              disabled={disabled}
              onClick={event=>move(chip.id,event.currentTarget,[...picked,chip.id])} lang="en">
              {chip.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function chipsText(chips: Chip[], picked: string[]): string {
  const byId = new Map(chips.map(chip => [chip.id, chip.text]));
  return picked.map(id => byId.get(id) ?? '').join(' ');
}
