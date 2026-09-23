/* YouTube -> grounded Fit Timer program.
   The model never receives only a URL and a request to guess a workout. */
const { store } = require('./store');
const { generate, generateGeminiVideo } = require('./ai');
const FitAIProtocol = require('./ai-protocol');

const CACHE_TTL = 7 * 86400;
const WATCH_HEADERS = {
  'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36',
  'accept-language':'en-US,en;q=0.8'
};

function videoIdFromUrl(raw){
  const s = String(raw || '').trim();
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{6,20})/i);
  return m ? m[1] : '';
}
function canonicalUrl(id){ return 'https://www.youtube.com/watch?v=' + id; }

async function fetchTimed(url, opts, timeout){
  const ctl = new AbortController();
  const timer = setTimeout(()=>ctl.abort(), timeout || 15000);
  try{ return await fetch(url, Object.assign({}, opts || {}, {signal:ctl.signal})); }
  finally{ clearTimeout(timer); }
}

function jsonObjectAfter(text, marker){
  let at = text.indexOf(marker);
  if(at < 0) return null;
  at = text.indexOf('{', at + marker.length);
  if(at < 0) return null;
  let depth = 0, inString = false, escaped = false;
  for(let i=at;i<text.length;i++){
    const ch = text[i];
    if(inString){
      if(escaped) escaped = false;
      else if(ch === '\\') escaped = true;
      else if(ch === '"') inString = false;
      continue;
    }
    if(ch === '"'){ inString = true; continue; }
    if(ch === '{') depth++;
    else if(ch === '}'){
      depth--;
      if(depth === 0){
        try{ return JSON.parse(text.slice(at, i + 1)); }catch(_){ return null; }
      }
    }
  }
  return null;
}
function playerResponseFromHtml(html){
  for(const marker of ['var ytInitialPlayerResponse = ','ytInitialPlayerResponse = ','window["ytInitialPlayerResponse"] = ']){
    const got = jsonObjectAfter(html, marker);
    if(got) return got;
  }
  return null;
}
function decodeXmlText(value){
  return String(value || '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
function transcriptFromPayload(raw){
  const text = String(raw || '').trim();
  if(!text) return [];
  try{
    const j = JSON.parse(text);
    return (j.events || []).map(e => {
      const body = (e.segs || []).map(s => s.utf8 || '').join('').replace(/\s+/g,' ').trim();
      return {start:(+e.tStartMs || 0)/1000,duration:(+e.dDurationMs || 0)/1000,text:body};
    }).filter(x => x.text);
  }catch(_){}
  const out = [], re = /<text\s+start="([^"]+)"(?:\s+dur="([^"]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  let m;
  while((m = re.exec(text))){
    const body = decodeXmlText(m[3]).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    if(body) out.push({start:+m[1] || 0,duration:+m[2] || 0,text:body});
  }
  return out;
}
function chooseTrack(tracks, locale){
  const lang = String(locale || '').toLowerCase().split('-')[0];
  const list = (tracks || []).filter(x => x && x.baseUrl);
  const score = t => {
    const lc = String(t.languageCode || '').toLowerCase(), manual = t.kind !== 'asr';
    if(lang && lc === lang && manual) return 40;
    if(lang && lc === lang) return 30;
    if(manual) return 20;
    return 10;
  };
  return list.sort((a,b)=>score(b)-score(a))[0] || null;
}
async function fetchTranscript(videoUrl, locale){
  const id = videoIdFromUrl(videoUrl);
  if(!id) throw Object.assign(new Error('video_bad_url'),{code:'video_bad_url',status:400});
  const key = 'yt:transcript:v2:' + id;
  try{
    const cached = JSON.parse(await store.get(key));
    if(cached && Array.isArray(cached.segments) && cached.segments.length) return cached;
  }catch(_){}
  const url = canonicalUrl(id);
  const page = await fetchTimed(url,{headers:WATCH_HEADERS},18000);
  if(!page.ok) throw Object.assign(new Error('youtube_page_'+page.status),{code:'video_unavailable',status:422});
  const player = playerResponseFromHtml(await page.text());
  if(!player) throw Object.assign(new Error('youtube_player_missing'),{code:'video_unavailable',status:422});
  const details = player.videoDetails || {};
  const renderer = player.captions && player.captions.playerCaptionsTracklistRenderer;
  const track = chooseTrack(renderer && renderer.captionTracks,locale);
  if(!track) throw Object.assign(new Error('youtube_captions_missing'),{code:'video_no_transcript',status:422});
  const sep = track.baseUrl.includes('?') ? '&' : '?';
  const cap = await fetchTimed(track.baseUrl + sep + 'fmt=json3',{headers:WATCH_HEADERS},18000);
  if(!cap.ok) throw Object.assign(new Error('youtube_captions_'+cap.status),{code:'video_no_transcript',status:422});
  const segments = transcriptFromPayload(await cap.text()).slice(0,6000);
  if(!segments.length) throw Object.assign(new Error('youtube_captions_empty'),{code:'video_no_transcript',status:422});
  const data={id,url,title:String(details.title||'').slice(0,300),author:String(details.author||'').slice(0,160),
    language:String(track.languageCode||'').slice(0,20),auto:track.kind==='asr',segments};
  try{ await store.set(key,JSON.stringify(data),CACHE_TTL); }catch(_){}
  return data;
}

function stamp(sec){
  sec=Math.max(0,Math.floor(+sec||0));
  const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;
  return (h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function normalizeEvidence(s){
  return String(s||'').toLowerCase().replace(/[ё]/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
function mechanicCue(s){
  const v=normalizeEvidence(s);
  if(/\d/.test(v)) return true;
  return /(?:секунд|повтор|раз|минут|подход|круг|second|reps|repetition|times|minute|set|round|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать|пятнадцать|двадцать)/i.test(v);
}
function cleanValue(v){
  if(typeof v==='number'&&isFinite(v)&&v>0&&v<=7200) return String(Math.round(v));
  const s=String(v==null?'':v).trim().replace(/[–—]/g,'-').replace(/\s+/g,'');
  return /^\d{1,4}(?:-\d{1,4})?$/.test(s)?s:null;
}
function cleanInt(v,lo,hi){ const n=parseInt(v,10); return isFinite(n)&&n>=lo&&n<=hi?n:null; }
function findEvidenceStart(segments,evidence){
  const needle=normalizeEvidence(evidence);
  if(needle.length<4) return null;
  for(const seg of segments||[]) if(normalizeEvidence(seg.text).includes(needle)) return +seg.start||0;
  return null;
}
function transcriptChunks(segments){
  const chunks=[]; let list=[],chars=0;
  for(const seg of segments||[]){
    const line='['+stamp(seg.start)+'] '+String(seg.text||'').replace(/\s+/g,' ').trim();
    if(list.length&&chars+line.length>16000){
      chunks.push({segments:list,text:list.map(x=>'['+stamp(x.start)+'] '+x.text).join('\n')}); list=[]; chars=0;
    }
    list.push(seg); chars+=line.length+1;
  }
  if(list.length) chunks.push({segments:list,text:list.map(x=>'['+stamp(x.start)+'] '+x.text).join('\n')});
  return chunks.slice(0,10);
}
function parseJsonObject(raw){
  let s=String(raw||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'').trim();
  const a=s.indexOf('{'),b=s.lastIndexOf('}');
  if(a>=0&&b>a)s=s.slice(a,b+1);
  try{return JSON.parse(s);}catch(_){return null;}
}
function validateEvidenceJson(out){
  const j=parseJsonObject(out&&out.text);
  const ok=!!(j&&typeof j.isWorkout==='boolean'&&Array.isArray(j.exercises)&&isFinite(+j.confidence));
  return {ok,text:ok?JSON.stringify(j):'',missing:[],reason:ok?'':'bad_video_evidence'};
}
function evidencePrompt(meta,chunk){
  return [
    'You are a conservative workout evidence extractor. Return ONLY valid JSON. Never infer from general fitness knowledge.',
    'isWorkout may be true only when this transcript clearly belongs to intentional exercise/workout instruction or a follow-along workout.',
    'Pets, vlogs, entertainment, sports commentary, product reviews, music and unrelated videos are NOT workouts.',
    'Every exercise must include evidence copied VERBATIM from ONE transcript line that identifies the movement.',
    'Mechanics may be filled only when mechanicsEvidence is copied VERBATIM from ONE transcript line that states reps/time/sets/rest. Otherwise use null.',
    'Use exactly: {"isWorkout":false,"confidence":0.0,"reason":"","exercises":[{"name":"","evidence":"","mechanicsEvidence":"","format":"reps|time|unknown","value":null,"sets":null,"restSec":null,"warmup":false,"warmupEvidence":""}],"rounds":null,"roundRestSec":null,"structureEvidence":""}',
    'For value use repetitions for reps, or seconds for time. A range may be "10-12". Do not turn ordinary actions into exercises.',
    'VIDEO TITLE: '+String(meta.title||'(unknown)'),
    'TRANSCRIPT:',chunk.text
  ].join('\n\n');
}
function groundEvidence(j,chunk){
  const confidence=Math.max(0,Math.min(1,+j.confidence||0)),exercises=[];
  if(j.isWorkout===true&&confidence>=.65){
    for(const raw of (j.exercises||[]).slice(0,30)){
      const evidenceAt=findEvidenceStart(chunk.segments,raw&&raw.evidence);
      if(evidenceAt==null)continue;
      const format=raw&&raw.format==='time'?'time':(raw&&raw.format==='reps'?'reps':'unknown');
      let value=cleanValue(raw&&raw.value);
      const mechAt=findEvidenceStart(chunk.segments,raw&&raw.mechanicsEvidence);
      if(mechAt==null||!mechanicCue(raw&&raw.mechanicsEvidence))value=null;
      const warmAt=findEvidenceStart(chunk.segments,raw&&raw.warmupEvidence);
      exercises.push({name:String(raw&&raw.name||'').replace(/[\r\n]+/g,' ').trim().slice(0,120),
        startSec:Math.floor(evidenceAt),format:value&&format!=='unknown'?format:'unknown',value,
        sets:value?cleanInt(raw&&raw.sets,1,10):null,restSec:value?cleanInt(raw&&raw.restSec,0,600):null,
        warmup:raw&&raw.warmup===true&&warmAt!=null,evidence:String(raw&&raw.evidence||'').slice(0,300),
        mechanicsEvidence:value?String(raw&&raw.mechanicsEvidence||'').slice(0,300):''});
    }
  }
  let rounds=null,roundRestSec=null;
  if(findEvidenceStart(chunk.segments,j.structureEvidence)!=null&&mechanicCue(j.structureEvidence)){
    rounds=cleanInt(j.rounds,1,10); roundRestSec=cleanInt(j.roundRestSec,0,600);
  }
  return {isWorkout:j.isWorkout===true,confidence,reason:String(j.reason||'').slice(0,240),exercises,rounds,roundRestSec};
}
async function extractTranscriptEvidence(settings,transcript){
  const grounded=[]; let falseConfidence=0,trueConfidence=0,rounds=null,roundRestSec=null;
  for(const chunk of transcriptChunks(transcript.segments)){
    const out=await generate('text',settings,evidencePrompt(transcript,chunk),{validate:validateEvidenceJson});
    const g=groundEvidence(parseJsonObject(out.text),chunk);
    if(g.isWorkout)trueConfidence=Math.max(trueConfidence,g.confidence); else falseConfidence=Math.max(falseConfidence,g.confidence);
    if(rounds==null&&g.rounds!=null){rounds=g.rounds;roundRestSec=g.roundRestSec;}
    grounded.push(...g.exercises);
  }
  grounded.sort((a,b)=>a.startSec-b.startSec);
  const dedup=[];
  for(const ex of grounded){
    const prev=dedup[dedup.length-1];
    if(prev&&normalizeEvidence(prev.name)===normalizeEvidence(ex.name)&&Math.abs(prev.startSec-ex.startSec)<8)continue;
    dedup.push(ex);
  }
  return {clearlyNotWorkout:dedup.length===0&&falseConfidence>=.85,confidence:trueConfidence,rounds,roundRestSec,exercises:dedup};
}
function visualPrompt(locale){
  return [
    'Inspect this YouTube video itself (audio, frames, on-screen timers/text). Return ONLY valid JSON.',
    'Be conservative: isWorkout=true only if the video intentionally teaches, demonstrates, or follows an exercise/workout.',
    'A video of cats/pets, a vlog, entertainment, music, sports commentary, or unrelated motion must return isWorkout=false and exercises=[].',
    'Never invent an exercise, rep count, duration, set count, rest, or warm-up status.',
    'Only include exercises whose start timestamp you can locate and whose repetitions or duration can be determined from the actual video.',
    'Use exactly: {"isWorkout":false,"confidence":0.0,"reason":"","title":"","exercises":[{"name":"","startSec":0,"format":"reps|time","value":"12","sets":null,"restSec":null,"warmup":false}],"rounds":null,"roundRestSec":null}',
    'For time, value is seconds. For repetitions, value is an integer or range like "10-12".',
    'Output names in '+(String(locale||'').toLowerCase().startsWith('ru')?'Russian':'English')+'.'
  ].join('\n\n');
}
function validateVisualJson(out){
  const j=parseJsonObject(out&&out.text);
  const ok=!!(j&&typeof j.isWorkout==='boolean'&&Array.isArray(j.exercises)&&isFinite(+j.confidence));
  return {ok,text:ok?JSON.stringify(j):'',missing:[],reason:ok?'':'bad_visual_video_evidence'};
}
function visualFacts(j){
  const confidence=Math.max(0,Math.min(1,+j.confidence||0));
  if(j.isWorkout!==true||confidence<.8)return {isWorkout:false,confidence,exercises:[]};
  const exercises=[];
  for(const raw of (j.exercises||[]).slice(0,40)){
    const name=String(raw&&raw.name||'').replace(/[\r\n]+/g,' ').trim().slice(0,120);
    const startSec=cleanInt(raw&&raw.startSec,0,24*3600);
    const format=raw&&raw.format==='time'?'time':(raw&&raw.format==='reps'?'reps':'');
    const value=cleanValue(raw&&raw.value);
    if(!name||startSec==null||!format||!value)continue;
    exercises.push({name,startSec,format,value,sets:cleanInt(raw.sets,1,10),restSec:cleanInt(raw.restSec,0,600),warmup:raw.warmup===true});
  }
  return {isWorkout:true,confidence,exercises,rounds:cleanInt(j.rounds,1,10),roundRestSec:cleanInt(j.roundRestSec,0,600),title:String(j.title||'').slice(0,300)};
}
function sourceFacts(id,title,source,data){
  const base=canonicalUrl(id);
  const exercises=(data.exercises||[]).filter(x=>x&&x.value&&(x.format==='reps'||x.format==='time')).slice(0,40).map(x=>({
    name:x.name,format:x.format,value:x.value,sets:x.sets==null?1:x.sets,restSec:x.restSec==null?0:x.restSec,warmup:x.warmup===true,
    startSec:Math.max(0,Math.floor(+x.startSec||0)),video:base+'&t='+Math.max(0,Math.floor(+x.startSec||0))+'s'
  }));
  return {id,title:String(title||'').slice(0,300),source,url:base,rounds:data.rounds==null?1:data.rounds,
    roundRestSec:data.roundRestSec==null?0:data.roundRestSec,exercises};
}
function finalPrompt(clientPrompt,facts){
  return String(clientPrompt||'')+'\n\n'+[
    '=== VERIFIED VIDEO FACTS — SERVER GROUND TRUTH ===',
    'Do NOT analyze the URL again. Do NOT add, remove, reorder, merge, split, or substitute exercises.',
    'There must be exactly '+facts.exercises.length+' exercise blocks, in this exact order.',
    'For every exercise copy format, value, sets, rest and warm-up exactly from VERIFIED_FACTS.',
    'Neutral defaults sets=1, restSec=0 and rounds=1 only mean the source did not specify repetition of that container.',
    'Use the exact video URL supplied for each exercise. It already contains a verified start timestamp.',
    'Do not add weights, progression, extra rounds, extra rest, or extra repetitions not present below.',
    'You may write concise names/descriptions in the requested UI language, but descriptions must not change mechanics.',
    'Use КРУГИ: '+facts.rounds+' and ОТДЫХ МЕЖДУ КРУГАМИ: '+facts.roundRestSec+'.',
    'VERIFIED_FACTS:',JSON.stringify(facts)
  ].join('\n');
}
function lineValue(block,label){
  const m=String(block||'').match(new RegExp('(?:^|\\n)'+label+':\\s*([^\\n]*)','m'));
  return m?m[1].trim():'';
}
function normalizedValue(v){return String(v||'').replace(/[–—]/g,'-').replace(/\s+/g,'');}
function timestampFromUrl(v){const m=String(v||'').match(/[?&]t=(\d+)(?:s)?(?:&|$)/i);return m?+m[1]:null;}
function validateFinalProgram(raw,facts){
  const base=FitAIProtocol.validateResponse('video.parse',raw);
  if(!base.ok)return base;
  const text=base.text;
  const blocks=text.split(/(?=^УПРАЖНЕНИЕ:\s*\S)/gm).filter(x=>/^УПРАЖНЕНИЕ:/m.test(x));
  if(blocks.length!==facts.exercises.length)return {ok:false,text,missing:[],reason:'video_exercise_count_mismatch'};
  if(parseInt(lineValue(text,'КРУГИ'),10)!==facts.rounds||parseInt(lineValue(text,'ОТДЫХ МЕЖДУ КРУГАМИ'),10)!==facts.roundRestSec)
    return {ok:false,text,missing:[],reason:'video_rounds_changed'};
  for(let i=0;i<blocks.length;i++){
    const block=blocks[i],expected=facts.exercises[i],fmt=lineValue(block,'ФОРМАТ').toLowerCase();
    const isTime=/врем|сек|time/.test(fmt);
    if((expected.format==='time')!==isTime)return {ok:false,text,missing:[],reason:'video_format_changed'};
    if(normalizedValue(lineValue(block,'ЗНАЧЕНИЕ'))!==normalizedValue(expected.value))return {ok:false,text,missing:[],reason:'video_value_changed'};
    if(parseInt(lineValue(block,'ПОДХОДЫ'),10)!==expected.sets)return {ok:false,text,missing:[],reason:'video_sets_changed'};
    if(parseInt(lineValue(block,'ОТДЫХ'),10)!==expected.restSec)return {ok:false,text,missing:[],reason:'video_rest_changed'};
    const warm=/^(?:да|yes|true|1)$/i.test(lineValue(block,'РАЗМИНКА'));
    if(warm!==expected.warmup)return {ok:false,text,missing:[],reason:'video_warmup_changed'};
    const video=lineValue(block,'ВИДЕО');
    if(videoIdFromUrl(video)!==facts.id)return {ok:false,text,missing:[],reason:'video_source_changed'};
    const ts=timestampFromUrl(video);
    if(ts==null||Math.abs(ts-expected.startSec)>3)return {ok:false,text,missing:[],reason:'video_timestamp_changed'};
  }
  return {ok:true,text,missing:[],reason:''};
}
function videoError(code,status){const e=new Error(code);e.code=code;e.status=status||422;return e;}

async function buildYoutubeProgram(settings,opts){
  const id=videoIdFromUrl(opts&&opts.videoUrl);
  if(!id)throw videoError('video_bad_url',400);
  const url=canonicalUrl(id),locale=String(opts&&opts.locale||'ru').slice(0,10);
  let transcript=null,transcriptFailure=null,facts=null;
  try{transcript=await fetchTranscript(url,locale);}catch(e){transcriptFailure=e;}
  if(transcript){
    const evidence=await extractTranscriptEvidence(settings,transcript);
    if(evidence.clearlyNotWorkout)throw videoError('video_not_workout',422);
    if(evidence.exercises.some(x=>x.value&&x.format!=='unknown'))facts=sourceFacts(id,transcript.title,'transcript',evidence);
  }
  if(!facts||!facts.exercises.length){
    try{
      const out=await generateGeminiVideo(settings,url,visualPrompt(locale),{validate:validateVisualJson});
      const visual=visualFacts(parseJsonObject(out.text));
      if(!visual.isWorkout&&visual.confidence>=.8)throw videoError('video_not_workout',422);
      if(visual.isWorkout&&visual.exercises.length)facts=sourceFacts(id,(transcript&&transcript.title)||visual.title,'visual',visual);
    }catch(e){
      if(e&&e.code==='video_not_workout')throw e;
      if(!transcript&&transcriptFailure&&transcriptFailure.code==='video_unavailable')throw videoError('video_unavailable',422);
    }
  }
  if(!facts||!facts.exercises.length){
    if(transcriptFailure&&transcriptFailure.code==='video_unavailable')throw videoError('video_unavailable',422);
    throw videoError(transcript?'video_insufficient':'video_no_transcript',422);
  }
  const final=await generate('text',settings,finalPrompt(opts&&opts.clientPrompt,facts),{validate:out=>validateFinalProgram(out&&out.text,facts)});
  return Object.assign({},final,{video:{id,title:facts.title,source:facts.source,transcript:!!transcript,exercises:facts.exercises.length}});
}

module.exports={buildYoutubeProgram,videoIdFromUrl,_test:{transcriptFromPayload,groundEvidence,visualFacts,validateFinalProgram,sourceFacts,parseJsonObject}};
