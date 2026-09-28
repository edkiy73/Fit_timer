import { bare, canon, expand, norm } from './answer-normalize';

const OPTIONAL:Record<string,1>={please:1};
const TIME1:Record<string,1>={
  yesterday:1,today:1,tomorrow:1,tonight:1,now:1,then:1,later:1,soon:1,
  always:1,usually:1,often:1,sometimes:1
};
const TIME2A:Record<string,1>={last:1,next:1,this:1,every:1};
const TIME2B:Record<string,1>={
  week:1,year:1,month:1,weekend:1,morning:1,evening:1,night:1,day:1,
  summer:1,winter:1,monday:1,friday:1,sunday:1
};
const SOFT:Record<string,1>={now:1,right:1,currently:1,today:1,already:1};

export function dropOptional(value:string):string{
  return value.split(' ').filter(word=>!OPTIONAL[word]).join(' ');
}

export function stripTime(words:string[]):string[]{
  const result=words.slice();
  let changed=true;
  while(changed){
    changed=false;
    for(let i=0;i<result.length-1;i++){
      if(result[i]==='right'&&result[i+1]==='now'){
        result.splice(i,2);
        changed=true;
        break;
      }
      const a=result[i],b=result[i+1];
      if(a && b && TIME2A[a]&&TIME2B[b]){
        result.splice(i,2);
        changed=true;
        break;
      }
    }
    if(changed)continue;
    for(let i=0;i<result.length;i++){
      const word=result[i];
      if(result.length>1 && word && TIME1[word]){
        result.splice(i,1);
        changed=true;
        break;
      }
    }
  }
  return result;
}

export function softDiffOk(a:string,b:string):boolean{
  const left=a?a.split(' '):[];
  const right=b?b.split(' '):[];
  const count:Record<string,number>={};
  for(const word of left) count[word]=(count[word]||0)+1;
  for(const word of right) count[word]=(count[word]||0)-1;
  return Object.keys(count).every(word=>count[word]===0||Boolean(SOFT[word]));
}

export function splitCore(value:string):{c:string;t:string}{
  const words=canon(value).split(' ').filter(Boolean);
  const core=stripTime(words);
  const count:Record<string,number>={};
  for(const word of words) count[word]=(count[word]||0)+1;
  for(const word of core) count[word]=(count[word]||0)-1;

  const moved:string[]=[];
  for(const word of Object.keys(count)){
    for(let i=0;i<(count[word]||0);i++) moved.push(word);
  }
  return {c:core.join(' '),t:moved.sort().join(' ')};
}

export function checkAnswer(input:string,accepted:string[]):boolean{
  const a=norm(input);
  const ae=expand(a);
  const ab=bare(a);
  const ac=canon(input);
  const ao=dropOptional(ac);
  const left=splitCore(input);

  return accepted.some(candidate=>{
    const b=norm(candidate);
    const bc=canon(candidate);
    if(
      a===b ||
      ab===bare(b) ||
      ae===expand(b) ||
      ac===bc ||
      ao===dropOptional(bc)
    ) return true;

    const right=splitCore(candidate);
    return left.c.split(' ').length>2
      && left.c===right.c
      && (left.t===right.t || softDiffOk(left.t,right.t));
  });
}
