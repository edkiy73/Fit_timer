// How a written answer is shown to the learner («Подходящий ответ», word chips) when the
// stored accepted answer is a normalised lowercase string from English Trainer
// («i didn't go there yesterday»). Answer checking keeps using answer.accepted unchanged.

const PROPER=new Map([
  'monday','tuesday','wednesday','thursday','friday','saturday','sunday',
  'january','february','march','april','june','july','august','september','october','november','december',
  'english','russian','british','american','spanish','german','french',
  'russia','japan','georgia','spain','portugal','thailand','indonesia','bali',
  'lisbon','tbilisi','batumi','london','moscow'
].map(word=>[word,word[0].toUpperCase()+word.slice(1)]));

const WH=new Set(['what','where','when','why','who','whom','whose','which','how']);
const AUX=new Set(['do','does','did','is','are','am','was','were','can','could','will','would','should','shall','may','might','have','has','had','must']);
const SUBJECT=new Set(['i','you','we','they','he','she','it','there','this','that','these','those','my','your','his','her','our','their','the','anyone','someone','somebody','anybody','everyone','not','n\'t']);

// Task wording that asks for a question («Сделай вопрос», «Спроси»), not a phrase that merely
// mentions one («У меня есть вопрос»).
const QUESTION_TASK=/(сделай|задай|верни|составь)\s+вопрос|спроси|уточни|узнай|переспроси/i;
// Fixed phrases the lowercase source cannot tell apart from ordinary words.
const PHRASES=[[/\bwork in it\b/g,'work in IT']];

/** True when the answer reads as a question: by the task wording or by its first words. */
export function looksLikeQuestion(answer,task=''){
  if(QUESTION_TASK.test(String(task||'')))return true;
  const words=String(answer||'').toLowerCase().replace(/[^a-z' ]/g,' ').split(/\s+/).filter(Boolean);
  if(!words.length)return false;
  const first=words[0].replace(/n't$/,'');
  if(WH.has(first))return words.length>1;
  if(AUX.has(first)||/n't$/.test(words[0]))return words.length>1&&SUBJECT.has(words[1]);
  return false;
}

/** The answer as a learner should see it, or undefined when the stored text already reads well. */
export function displayAnswerFor(answer,{task='',hint=''}={}){
  const raw=String(answer||'').replace(/\s+/g,' ').trim();
  if(!raw||/[A-Z]/.test(raw))return undefined;
  // Abbreviations the Russian phrase spells in capitals (IT, CS) keep them in the answer.
  const caps=new Map((String(task)+' '+String(hint)).match(/\b[A-Z]{2,}\b/g)?.map(word=>[word.toLowerCase(),word])||[]);
  let out=raw
    .replace(/(^|[^a-z'])i(?=$|[^a-z])/g,'$1I')
    .replace(/[a-z]+/g,word=>caps.get(word)||PROPER.get(word)||word);
  for(const [pattern,value] of PHRASES)out=out.replace(pattern,value);
  out=out.replace(/(^|[.?!]\s+)([a-z])/g,(_,lead,letter)=>lead+letter.toUpperCase());
  if(!/[.?!…]$/.test(out))out+=looksLikeQuestion(raw,task)?'?':'.';
  return out===raw?undefined:out;
}
