/**
 * Answer normalization ported from the legacy English Trainer.
 * Keep behavior stable here; intentional product changes belong in separate tests/PRs.
 */

export function norm(value:string):string{
  return String(value)
    .toLowerCase()
    .replace(/[\u2019\u02bc]/g,"'")
    .replace(/[.,!?;:"()\u2014\u2013-]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

export function expand(value:string):string{
  return (' '+value+' ')
    .replace(/n't\b/g,' not')
    .replace(/'ll\b/g,' will')
    .replace(/'re\b/g,' are')
    .replace(/'ve\b/g,' have')
    .replace(/'d\b/g,' would')
    .replace(/'m\b/g,' am')
    .replace(/\bcannot\b/g,'can not')
    .replace(/\s+/g,' ')
    .trim();
}

export function bare(value:string):string{
  return String(value).replace(/'/g,'');
}

const COLLOQ:Array<[RegExp,string]>=[
  [/\bgonna\b/g,'going to'],
  [/\bwanna\b/g,'want to'],
  [/\bgotta\b/g,'got to'],
  [/\bkinda\b/g,'kind of'],
  [/\bsorta\b/g,'sort of'],
  [/\blemme\b/g,'let me'],
  [/\bgimme\b/g,'give me'],
  [/\bdunno\b/g,'do not know'],
  [/\bcuz\b|\bcos\b/g,'because'],
  [/\b(yeah|yep|yup|yea)\b/g,'yes'],
  [/\b(nope|nah)\b/g,'no'],
  [/\bokay\b/g,'ok'],
  [/\bfavour\b/g,'favor'],
  [/\bcolour\b/g,'color'],
  [/\brealise\b/g,'realize'],
  [/\bapologise\b/g,'apologize'],
  [/\bpractise\b/g,'practice'],
  [/\btravelling\b/g,'traveling'],
  [/\bo clock\b/g,''],
  [/\boclock\b/g,''],
];

const NUMW:Record<string,string>={
  zero:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',
  nine:'9',ten:'10',eleven:'11',twelve:'12',fifteen:'15',twenty:'20',thirty:'30',
  forty:'40',fifty:'50',sixty:'60'
};

const NOAPOS:Record<string,string>={
  im:'i am',ive:'i have',ill:'i will',dont:'do not',doesnt:'does not',didnt:'did not',
  cant:'can not',cannot:'can not',wont:'will not',wouldnt:'would not',shouldnt:'should not',
  couldnt:'could not',isnt:'is not',arent:'are not',wasnt:'was not',werent:'were not',
  hasnt:'has not',havent:'have not',hadnt:'had not',theyre:'they are',youre:'you are',
  youve:'you have',youll:'you will',weve:'we have',theyve:'they have',thats:'that is',
  whats:'what is',lets:'let us',hes:'he is',shes:'she is'
};

export function canon(value:string):string{
  let result=expand(norm(value));
  for(const [pattern,replacement] of COLLOQ) result=result.replace(pattern,replacement);
  result=bare(result);
  result=result.split(' ').map(word=>NOAPOS[word]||word).join(' ');
  result=result
    .replace(/\bhave got to\b|\bhas got to\b|\bhad got to\b/g,'got to')
    .replace(/\bhave got\b/g,'have');
  result=result
    .split(' ')
    .map(word=>NUMW[word]||word)
    .filter(Boolean)
    .join(' ');
  return result.replace(/\s+/g,' ').trim();
}
