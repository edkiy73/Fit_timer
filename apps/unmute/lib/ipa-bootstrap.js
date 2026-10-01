'use strict';

// British pronunciation for the lexicon: IPA in the style of British learner dictionaries
// (Oxford/Cambridge: e, ʌ, r, non-rhotic) plus a Russian-letter hint with the stress marked.
// Source: Britfone (MIT), a hand-checked British dictionary of ~16k everyday words.
const IPA_SOURCE_SHA='1062be14adc96c358f2087ac5449d72130c7a6f4';
const IPA_SOURCE_URL='https://raw.githubusercontent.com/JoseLlarena/Britfone/'+IPA_SOURCE_SHA+'/britfone.main.3.0.1.csv';

// Words of the course that Britfone does not list: contractions, a few inflections, names.
// Same notation as Britfone: phonemes separated by spaces, stress mark right before its vowel.
const SUPPLEMENT={
  "it's":'ˈɪ t s', "i'm":'ˈaɪ m', "i'd":'ˈaɪ d', "i'll":'ˈaɪ l', "i've":'ˈaɪ v',
  "should've":'ʃ ˈʊ d ə v', "could've":'k ˈʊ d ə v', "would've":'w ˈʊ d ə v',
  "must've":'m ˈʌ s t ə v', "might've":'m ˈaɪ t ə v',
  "he's":'h ˈiː z', "she's":'ʃ ˈiː z', "that's":'ð ˈæ t s', "there's":'ð ˈeə z',
  "what's":'w ˈɒ t s', "where's":'w ˈeə z', "who's":'h ˈuː z', "here's":'h ˈɪə z',
  "we're":'w ˈɪə', "you're":'j ˈɔː', "they're":'ð ˈeə',
  "you'd":'j ˈuː d', "we'd":'w ˈiː d', "he'd":'h ˈiː d', "she'd":'ʃ ˈiː d', "they'd":'ð ˈeɪ d',
  "it'd":'ˈɪ t ə d', "it'll":'ˈɪ t ə l', "that'll":'ð ˈæ t ə l',
  "you'll":'j ˈuː l', "he'll":'h ˈiː l', "she'll":'ʃ ˈiː l', "we'll":'w ˈiː l', "they'll":'ð ˈeɪ l',
  "we've":'w ˈiː v', "you've":'j ˈuː v', "they've":'ð ˈeɪ v',
  coulda:'k ˈʊ d ə', shoulda:'ʃ ˈʊ d ə', woulda:'w ˈʊ d ə',
  lemme:'l ˈe m i', gimme:'ɡ ˈɪ m i', dunno:'d ə n ˈəʊ', ok:'ˌəʊ k ˈeɪ',
  waits:'w ˈeɪ t s', rains:'r ˈeɪ n z', rained:'r ˈeɪ n d', winters:'w ˈɪ n t ə z',
  cafe:'k ˈæ f eɪ', 'café':'k ˈæ f eɪ', cafes:'k ˈæ f eɪ z',
  slower:'s l ˈəʊ ə', hotter:'h ˈɒ t ə', quieter:'k w ˈaɪ ə t ə', remotely:'r ɪ m ˈəʊ t l i',
  interrupting:'ˌɪ n t ə r ˈʌ p t ɪ ŋ', supposing:'s ə p ˈəʊ z ɪ ŋ', tiring:'t ˈaɪ ə r ɪ ŋ',
  procrastination:'p r ə k r ˌæ s t ɪ n ˈeɪ ʃ ə n', raincoat:'r ˈeɪ n k ˌəʊ t',
  seatbelt:'s ˈiː t b ˌe l t', softening:'s ˈɒ f ə n ɪ ŋ', texted:'t ˈe k s t ɪ d',
  weekday:'w ˈiː k d ˌeɪ', weekdays:'w ˈiː k d ˌeɪ z',
  collocation:'k ˌɒ l ə k ˈeɪ ʃ ə n', collocations:'k ˌɒ l ə k ˈeɪ ʃ ə n z', phrasal:'f r ˈeɪ z ə l',
  tv:'t ˌiː v ˈiː', ai:'ˌeɪ ˈaɪ', uk:'j ˌuː k ˈeɪ', usa:'j ˌuː e s ˈeɪ', atm:'ˌeɪ t ˌiː ˈe m',
  'p.m.':'p ˌiː ˈe m', durian:'d j ˈʊə r i ə n', ivan:'ˈaɪ v ə n', "anna's":'ˈæ n ə z',
  tbilisi:'t ə b ˈɪ l ɪ s i', batumi:'b ə t ˈuː m i', porto:'p ˈɔː t əʊ', rustaveli:'r ˌʊ s t ə v ˈe l i'
};
// Learner dictionaries show the weak form for these; every other word gets its stressed (citation) form.
const WEAK_FIRST=new Set(['a','an','the']);

// Britfone/espeak symbols → British learner-dictionary symbols.
const SYMBOL={ɛ:'e',ɛə:'eə',ɐ:'ʌ',ɹ:'r',g:'ɡ',ɝ:'ɜː',ɚ:'ə',oʊ:'əʊ',ɾ:'t',ɔ:'ɒ',a:'æ',o:'ɒ'};
const VOWELS=new Set(['iː','i','ɪ','e','æ','ʌ','ɑː','ɒ','ɔː','ʊ','uː','ɜː','ə','eɪ','aɪ','ɔɪ','əʊ','aʊ','ɪə','eə','ʊə']);
const CONSONANTS=new Set(['p','b','t','d','k','ɡ','f','v','θ','ð','s','z','ʃ','ʒ','tʃ','dʒ','h','m','n','ŋ','l','r','w','j']);
// Longest first, for reading IPA strings that are already stored in the lexicon.
const STRING_TOKENS=['tʃ','dʒ','eɪ','aɪ','ɔɪ','əʊ','oʊ','aʊ','ɪə','eə','ɛə','ʊə','iː','uː','ɑː','ɔː','ɜː','ɝ','ɚ',
  ...VOWELS,...CONSONANTS,'ɛ','ɐ','ɹ','g','ɾ','ɔ','a','o'].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>b.length-a.length);

const ONSET2=new Set(['pr','br','tr','dr','kr','ɡr','fr','θr','ʃr','pl','bl','kl','ɡl','fl','sl',
  'pj','bj','tj','dj','kj','ɡj','fj','vj','θj','sj','mj','nj','hj','lj','tw','dw','kw','ɡw','sw','θw',
  'sp','st','sk','sm','sn','sf']);
const ONSET3=new Set(['spr','str','skr','spl','skl','spj','stj','skj','skw']);

function normalize(value){
  return String(value||'').toLowerCase().replace(/[’ʼ]/g,"'").replace(/\s+/g,' ').trim();
}
function clone(value){return JSON.parse(JSON.stringify(value));}

async function defaultLoadIpaSource(){
  const response=await fetch(IPA_SOURCE_URL,{signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw new Error('ipa_source_http_'+response.status);
  return response.text();
}

// A word is a list of phonemes; a vowel may carry stress 1 (primary) or 2 (secondary).
function phoneme(raw){
  let p=raw,stress=0;
  if(p.startsWith('ˈ')){stress=1;p=p.slice(1);}
  else if(p.startsWith('ˌ')){stress=2;p=p.slice(1);}
  p=SYMBOL[p]||p;
  if(!VOWELS.has(p)&&!CONSONANTS.has(p)) return null;
  return {p,stress:VOWELS.has(p)?stress:0};
}
function parseWord(notation){
  const word=[];
  for(const raw of String(notation||'').trim().split(/\s+/)){
    const item=phoneme(raw);
    if(!item) return null;
    word.push(item);
  }
  return word.length?word:null;
}

// Reads a stored IPA string ("/ˈwɜːrk/", "hɜːr") into phonemes; drops the American/linking r
// before a consonant or at the end, which British English does not pronounce.
function parseIpaString(value){
  const text=String(value||'').split(',')[0].replace(/[\/\[\]()]/g,'').replace(/[.‿ ]/g,'').trim();
  if(!text) return null;
  const word=[];
  let pending=0;
  for(let i=0;i<text.length;){
    const ch=text[i];
    if(ch==='ˈ'){pending=1;i++;continue;}
    if(ch==='ˌ'){pending=pending||2;i++;continue;}
    const token=STRING_TOKENS.find(item=>text.startsWith(item,i));
    if(!token) return null;
    i+=token.length;
    const p=SYMBOL[token]||token;
    const vowel=VOWELS.has(p);
    word.push({p,stress:vowel?pending:0});
    if(vowel) pending=0;
  }
  const out=word.filter((item,index)=>!(item.p==='r'&&!(word[index+1]&&VOWELS.has(word[index+1].p))));
  return out.some(item=>VOWELS.has(item.p))?out:null;
}

function variantDistance(a,b){
  const x=a.map(item=>item.p),y=b.map(item=>item.p);
  const row=Array.from({length:y.length+1},(_,i)=>i);
  for(let i=1;i<=x.length;i++){
    let prev=row[0];row[0]=i;
    for(let j=1;j<=y.length;j++){
      const keep=row[j];
      row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(x[i-1]===y[j-1]?0:1));
      prev=keep;
    }
  }
  return row[y.length];
}

function parseIpaSource(source){
  const variants=new Map();
  for(const rawLine of String(source||'').split(/\r?\n/)){
    const comma=rawLine.indexOf(',');
    if(comma<=0) continue;
    const surface=normalize(rawLine.slice(0,comma).replace(/\(\d+\)$/,''));
    const word=parseWord(rawLine.slice(comma+1));
    if(!surface||!word) continue;
    if(!variants.has(surface)) variants.set(surface,[]);
    variants.get(surface).push(word);
  }
  for(const [surface,notation] of Object.entries(SUPPLEMENT)){
    if(!variants.has(surface)) variants.set(surface,[parseWord(notation)]);
  }
  return variants;
}

// Picks the dictionary variant for a surface. An existing pronunciation chooses between
// homographs (live /lɪv/ vs /laɪv/); otherwise the stressed citation form wins.
function chooseVariant(list,existing,surface){
  if(!list||!list.length) return null;
  const stressed=list.filter(word=>word.some(item=>item.stress===1));
  const pool=stressed.length?stressed:list;
  if(existing&&pool.length>1){
    return pool.slice().sort((a,b)=>variantDistance(a,existing)-variantDistance(b,existing))[0];
  }
  // "trying": the full /ˈtraɪɪŋ/, not the squeezed /traɪŋ/ that some entries list first.
  if(surface&&surface.endsWith('ing')){
    const full=pool.find(word=>word.length>1&&word[word.length-2].p==='ɪ'&&word[word.length-1].p==='ŋ');
    if(full) return full;
  }
  return pool[0];
}

function lookupSurface(index,surface,existing){
  const key=normalize(surface);
  if(index.has(key)){
    const list=index.get(key);
    return WEAK_FIRST.has(key)&&!existing ? [list[0]] : [chooseVariant(list,existing,key)];
  }
  // Short multi-word forms ("put off", "lie down"): each word from the dictionary.
  const words=key.replace(/[?!.,…—]/g,' ').split(/\s+/).filter(Boolean);
  if(words.length<2||words.length>4||words.length!==key.split(/\s+/).length) return null;
  const out=[];
  for(const word of words){
    const list=index.get(word);
    if(!list) return null;
    out.push(WEAK_FIRST.has(word)?list[0]:chooseVariant(list,null,word));
  }
  return out;
}

// Stress mark goes before the syllable, i.e. before the longest legal English onset.
function onsetStart(word,vowelIndex){
  let start=vowelIndex;
  while(start>0&&CONSONANTS.has(word[start-1].p)) start--;
  for(let s=start;s<vowelIndex;s++){
    const cluster=word.slice(s,vowelIndex).map(item=>item.p);
    const joined=cluster.join('');
    if(cluster.length===1&&cluster[0]!=='ŋ') return s;
    if(cluster.length===2&&ONSET2.has(joined)) return s;
    if(cluster.length===3&&ONSET3.has(joined)) return s;
  }
  return vowelIndex;
}

function wordToIpa(word){
  const marks=new Map();
  const primary=word.findIndex(item=>item.stress===1);
  word.forEach((item,index)=>{
    // Learner dictionaries mark secondary stress only before the main one (ˌʌndəˈstænd),
    // not on the tail of a compound (ˈbɜːθdeɪ, not ˈbɜːθˌdeɪ).
    if(item.stress===1||(item.stress===2&&(primary<0||index<primary))){
      marks.set(onsetStart(word,index),item.stress===1?'ˈ':'ˌ');
    }
  });
  // A one-syllable word carries no stress mark in learner dictionaries.
  const syllables=word.filter(item=>VOWELS.has(item.p)).length;
  return word.map((item,index)=>(syllables>1&&marks.has(index)?marks.get(index):'')+item.p).join('');
}

const RU_VOWEL={iː:'и',i:'и',ɪ:'и',e:'э',æ:'э',ʌ:'а',ɑː:'а',ɒ:'о',ɔː:'о',ʊ:'у',uː:'у',ɜː:'ё',ə:'э',
  eɪ:'эй',aɪ:'ай',ɔɪ:'ой',əʊ:'оу',aʊ:'ау',ɪə:'иэ',eə:'эа',ʊə:'уэ'};
// /j/ + vowel → one iotated letter: you → ю, yes → е, young → я.
const RU_IOTATED={uː:'ю',ʊ:'ю',ʊə:'юэ',e:'е',ə:'е',æ:'я',ʌ:'я',ɑː:'я',ɒ:'ё',ɔː:'ё',ɜː:'ё',iː:'йи',i:'йи',ɪ:'йи',ɪə:'йиэ',eə:'еа',əʊ:'ёу'};
const RU_CONSONANT={p:'п',b:'б',t:'т',d:'д',k:'к',ɡ:'г',f:'ф',v:'в',θ:'с',ð:'з',s:'с',z:'з',ʃ:'ш',ʒ:'ж',
  tʃ:'ч',dʒ:'дж',h:'х',m:'м',n:'н',ŋ:'нг',l:'л',r:'р',w:'у',j:'й'};
const SYLLABIC_N=new Set(['t','d','s','z','ʃ','ʒ']);
const SYLLABIC_L=new Set(['t','d','s','z','p','b','k','ɡ','v']);
const NO_SOFT_SIGN=new Set(['ʃ','ʒ','tʃ','dʒ','j']);

function wordToRu(word){
  const syllables=word.filter(item=>VOWELS.has(item.p)).length;
  let out='';
  for(let i=0;i<word.length;i++){
    const item=word[i],prev=word[i-1],next=word[i+1];
    if(VOWELS.has(item.p)){
      // "station" → стэйшн, "table" → тэйбл: the unstressed ə of a final -ən/-əl is barely heard.
      if(item.p==='ə'&&next&&i+2===word.length&&prev&&!VOWELS.has(prev.p)&&
        ((next.p==='n'&&SYLLABIC_N.has(prev.p))||(next.p==='l'&&SYLLABIC_L.has(prev.p)))) continue;
      // Final ə after a consonant sounds like a short «а»: water → уо́та; after a vowel, «э»: hour → а́уэ.
      let letters=item.p==='ə'&&i===word.length-1&&syllables>1&&prev&&!VOWELS.has(prev.p) ? 'а' : RU_VOWEL[item.p];
      if(prev&&prev.p==='j'){
        letters=RU_IOTATED[item.p]||('й'+letters);
        const beforeJ=word[i-2];
        if(beforeJ&&CONSONANTS.has(beforeJ.p)&&!NO_SOFT_SIGN.has(beforeJ.p)) letters='ь'+letters.replace(/^й/,'');
      }
      if(item.stress===1&&syllables>1){
        const at=letters.search(/[аэиоуыеёюя]/);
        if(at>=0&&letters[at]!=='ё') letters=letters.slice(0,at+1)+'́'+letters.slice(at+1);
      }
      out+=letters;
      continue;
    }
    if(item.p==='j'&&next&&VOWELS.has(next.p)) continue;
    if(item.p==='w'&&next&&(next.p==='ʊ'||next.p==='uː')){out+='в';continue;}
    if(item.p==='ŋ'&&next&&(next.p==='k'||next.p==='ɡ')){out+='н';continue;}
    const letters=RU_CONSONANT[item.p];
    // months → манс, clothes → клоуз: θs/ðz give one Russian letter, not two.
    if(!out.endsWith(letters)||!prev||VOWELS.has(prev.p)||prev.p===item.p) out+=letters;
  }
  return out;
}

function pronounce(words){
  return {ipa:words.map(wordToIpa).join(' '),ruReading:words.map(wordToRu).join(' ')};
}

function britishFor(index,surface,existingIpa){
  const existing=existingIpa?parseIpaString(existingIpa):null;
  const words=lookupSurface(index,surface,existing);
  if(words) return {from:'dictionary',...pronounce(words)};
  // Not in the dictionary: keep the stored transcription, without the American r.
  if(existing&&!String(surface).trim().includes(' ')) return {from:'stored',...pronounce([existing])};
  return null;
}

function samePronunciation(a,b){
  return String(a&&a.ipa||'')===String(b&&b.ipa||'')&&String(a&&a.ruReading||'')===String(b&&b.ruReading||'');
}

function planIpaBootstrap(lexicon,source){
  const index=parseIpaSource(source);
  const changes=[];
  const unmatched=[];
  let forms=0,alreadyBritish=0,updatedForms=0,fromStored=0;

  function apply(target,surface){
    const current=target.pronunciation||null;
    const british=britishFor(index,surface,current&&current.ipa);
    if(!british){
      unmatched.push(surface);
      return false;
    }
    if(british.from==='stored') fromStored++;
    const next={...(current||{}),ipa:british.ipa,ruReading:british.ruReading};
    if(samePronunciation(current,next)){alreadyBritish++;return false;}
    target.pronunciation=next;
    updatedForms++;
    return true;
  }

  for(const original of lexicon&&lexicon.entries||[]){
    if(original.deprecated) continue;
    const next=clone(original);
    let changed=false;
    const lemma=normalize(original.lemma);
    const list=next.forms||[];
    // The lemma's own pronunciation covers every form spelled like the lemma without one
    // ("read" past, "put" past keep sharing it rather than guessing their vowel).
    if(next.pronunciation||list.some(form=>normalize(form&&form.text)===lemma&&!form.pronunciation)){
      forms++;
      changed=apply(next,original.lemma)||changed;
    }
    for(const form of list){
      const surface=normalize(form&&form.text);
      if(!surface||(surface===lemma&&!form.pronunciation)) continue;
      forms++;
      changed=apply(form,form.text)||changed;
    }
    if(changed){
      changes.push({id:original.id,expectedRevision:Math.max(1,+original.revision||1),entry:next});
    }
  }

  return {
    source:{sha:IPA_SOURCE_SHA,url:IPA_SOURCE_URL,entries:index.size},
    report:{forms,alreadyBritish,updatedForms,fromStored,unmatched:unmatched.length,
      unmatchedSample:[...new Set(unmatched)].slice(0,40),updatedLexemes:changes.length},
    changes
  };
}

module.exports={IPA_SOURCE_SHA,IPA_SOURCE_URL,defaultLoadIpaSource,parseIpaSource,parseIpaString,
  britishFor,planIpaBootstrap};
