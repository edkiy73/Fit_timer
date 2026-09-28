import { bare, canon } from './answer-normalize';

export type KnownWordLookup = (word:string)=>boolean;

const GRAM=new Set(
  ("do does did don't doesn't didn't is are am was were isn't aren't wasn't weren't be been being "+
   "have has had haven't hasn't hadn't will won't would wouldn't can can't cannot could couldn't "+
   "should shouldn't must mustn't might may shall let's "+
   "a an the to of in on at for from with by about into over under "+
   "not no nor never ever yet already just still since than then so and but or if when while because "+
   "i you he she it we they me him her them us my your his its our their mine yours "+
   "this that these those there here who what where why how which whose "+
   "some any much many more most less few little too enough very really quite pretty "+
   "am're ve ll d s m re")
    .split(' ')
    .filter(Boolean)
);

export function levenshtein(a:string,b:string):number{
  if(a===b)return 0;

  // Legacy treats one adjacent transposition as one typo.
  if(a.length===b.length){
    const diff:number[]=[];
    for(let i=0;i<a.length;i++) if(a.charAt(i)!==b.charAt(i)) diff.push(i);
    if(
      diff.length===2 &&
      diff[1]===diff[0]+1 &&
      a.charAt(diff[0])===b.charAt(diff[1]) &&
      a.charAt(diff[1])===b.charAt(diff[0])
    ) return 1;
  }

  const m=a.length,n=b.length;
  if(!m)return n;
  if(!n)return m;

  let prev=Array.from({length:n+1},(_,index)=>index);
  let cur=new Array<number>(n+1).fill(0);

  for(let i=1;i<=m;i++){
    cur[0]=i;
    for(let j=1;j<=n;j++){
      const cost=a.charAt(i-1)===b.charAt(j-1)?0:1;
      cur[j]=Math.min(
        (cur[j-1]??0)+1,
        (prev[j]??0)+1,
        (prev[j-1]??0)+cost
      );
    }
    const swap=prev;
    prev=cur;
    cur=swap;
  }

  return prev[n]??0;
}

export function isFormPair(a:string,b:string):boolean{
  const short=a.length<b.length?a:b;
  const long=a.length<b.length?b:a;

  if(long.indexOf(short)===0){
    const suffix=long.slice(short.length);
    if(/^(s|es|d|ed|ing|ies|er|est|ly|'s|'re|'ve|'ll|'d|'m|n't)$/.test(suffix)) return true;
  }

  if(
    long===short.replace(/y$/,'ies') ||
    long===short.replace(/y$/,'ied') ||
    long===short.replace(/e$/,'ing') ||
    long===short.replace(/e$/,'ed') ||
    long===short.replace(/e$/,'er') ||
    long===short.replace(/e$/,'est')
  ) return true;

  return false;
}

/**
 * Legacy "almost correct because of a typo" classifier.
 *
 * isKnownWord replaces old dictLook(). The algorithm only consults it when
 * exactly one differing token is a grammar/function word, matching legacy behavior.
 */
export function nearMiss(
  input:string,
  accepted:string[],
  isKnownWord:KnownWordLookup=()=>false
):boolean{
  const a=canon(input);
  if(!a)return false;

  for(const candidate of accepted){
    const b=canon(candidate);
    if(a===b)return false;

    const aw=a.split(' ');
    const bw=b.split(' ');
    if(aw.length!==bw.length)continue;

    const diff:Array<[string,string]>=[];
    for(let i=0;i<aw.length;i++){
      const left=aw[i],right=bw[i];
      if(left!==undefined && right!==undefined && left!==right) diff.push([left,right]);
    }
    if(diff.length!==1)continue;

    const pair=diff[0];
    if(!pair)continue;
    const [u,v]=pair;

    if(bare(u)===bare(v))return false;
    if(isFormPair(u,v))continue;

    const uGrammar=GRAM.has(u);
    const vGrammar=GRAM.has(v);
    if(uGrammar&&vGrammar)continue;

    let minLength=4;
    if(uGrammar||vGrammar){
      const other=uGrammar?v:u;
      if(GRAM.has(other)||isKnownWord(other))continue;
      minLength=3;
    }

    if(Math.max(u.length,v.length)<minLength)continue;

    const distance=levenshtein(u,v);
    if(distance===1 || (distance===2 && Math.max(u.length,v.length)>=8)) return true;
  }

  return false;
}

export function isGrammarWord(word:string):boolean{
  return GRAM.has(word);
}
