'use strict';

const { clampLine, clampText } = require('../../util');

const GOALS = ['slim','tone','glut','core','power','relief','flex','back','post','cardio'];
const LEVELS = ['Новичок','Средний','Продвинутый'];
const LANGS = ['ru','en'];
const TRANSLATABLE_KEYS = new Set([
  'ПРОГРАММА','ОПИСАНИЕ ПРОГРАММЫ','УПРАЖНЕНИЕ','ОПИСАНИЕ',
  'ОШИБКИ','ЗАМЕНА','ОПИСАНИЕ ЗАМЕНЫ'
]);

const clean=(v,n)=>String(v==null?'':v).slice(0,n);
const normLocale=v=>LANGS.includes(String(v||'').toLowerCase())?String(v).toLowerCase():'ru';

function cleanLocaleBlock(v){
  if(!v || typeof v!=='object') return null;
  return {
    name:clampLine(v.name,60),
    gives:clampText(v.gives,300),
    text:clean(v.text,60000)
  };
}

function protocolLine(line){
  const m=String(line||'').match(/^([А-ЯЁ][А-ЯЁ ]{1,40}):\s*(.*)$/);
  return m?{key:m[1],value:m[2]}:null;
}

function translationFieldsFromText(text){
  const out={programName:'',programDescription:'',exercises:[]};
  let ex=null;
  String(text||'').split(/\r?\n/).forEach(line=>{
    const p=protocolLine(line);if(!p)return;
    if(p.key==='ПРОГРАММА'){out.programName=p.value;return;}
    if(p.key==='ОПИСАНИЕ ПРОГРАММЫ'){out.programDescription=p.value;return;}
    if(p.key==='УПРАЖНЕНИЕ'){
      ex={index:out.exercises.length,name:p.value,description:'',mistakes:'',replacementName:'',replacementDescription:''};
      out.exercises.push(ex);return;
    }
    if(!ex)return;
    if(p.key==='ОПИСАНИЕ')ex.description=p.value;
    else if(p.key==='ОШИБКИ')ex.mistakes=p.value;
    else if(p.key==='ЗАМЕНА')ex.replacementName=p.value;
    else if(p.key==='ОПИСАНИЕ ЗАМЕНЫ')ex.replacementDescription=p.value;
  });
  return out;
}

function applyTranslationFields(sourceText,translated){
  const src=translationFieldsFromText(sourceText);
  const list=Array.isArray(translated&&translated.exercises)?translated.exercises:[];
  const byIndex=new Map(list.map((x,i)=>{x=x&&typeof x==='object'?x:{};return [Number.isInteger(+x.index)?+x.index:i,x];}));
  let exIndex=-1;
  return String(sourceText||'').split(/\r?\n/).map(line=>{
    const p=protocolLine(line);if(!p)return line;
    if(p.key==='ПРОГРАММА'){
      const v=String((translated&&translated.programName)||'').trim();
      return v?'ПРОГРАММА: '+v:line;
    }
    if(p.key==='ОПИСАНИЕ ПРОГРАММЫ'){
      const v=String((translated&&translated.programDescription)||'').trim();
      return v?'ОПИСАНИЕ ПРОГРАММЫ: '+v:line;
    }
    if(p.key==='УПРАЖНЕНИЕ')exIndex++;
    const x=byIndex.get(exIndex)||{};
    const map={
      'УПРАЖНЕНИЕ':'name',
      'ОПИСАНИЕ':'description',
      'ОШИБКИ':'mistakes',
      'ЗАМЕНА':'replacementName',
      'ОПИСАНИЕ ЗАМЕНЫ':'replacementDescription'
    };
    const field=map[p.key];
    if(!field)return line;
    const v=String(x[field]||'').trim();
    return v?p.key+': '+v:line;
  }).join('\n');
}

function translationPayload(source){
  const fields=translationFieldsFromText(source&&source.text);
  return {
    name:String(source&&source.name||''),
    gives:String(source&&source.gives||''),
    programName:fields.programName,
    programDescription:fields.programDescription,
    exercises:fields.exercises
  };
}

function translationPayloadComplete(source,payload){
  if(!payload||!String(payload.name||'').trim()||!String(payload.gives||'').trim())return false;
  const src=translationPayload(source);
  if(src.programName&&!String(payload.programName||'').trim())return false;
  if(src.programDescription&&!String(payload.programDescription||'').trim())return false;
  const list=Array.isArray(payload.exercises)?payload.exercises:[];
  if(list.length!==src.exercises.length)return false;
  for(let i=0;i<src.exercises.length;i++){
    const a=src.exercises[i],b=list.find(x=>x&&+x.index===i)||list[i]||{};
    for(const k of ['name','description','mistakes','replacementName','replacementDescription']){
      if(a[k]&&!String(b[k]||'').trim())return false;
    }
  }
  return true;
}

function normalizeTranslatedBlock(source,target){
  if(!source||!target)return target;
  const fields=translationFieldsFromText(target.text);
  return {
    name:clampLine(target.name,60),
    gives:clampText(target.gives,300),
    text:applyTranslationFields(source.text,fields)
  };
}

function normalizeCatalogText(it,fallbackSource){
  const sourceLocale=normLocale((it&&it.sourceLocale)||fallbackSource);
  const locales={};
  const src=(it&&it.locales&&typeof it.locales==='object')?it.locales:{};
  LANGS.forEach(lang=>{
    const block=cleanLocaleBlock(src[lang]);
    if(block&&(block.name||block.gives||block.text))locales[lang]=block;
  });
  const otherLocale=sourceLocale==='ru'?'en':'ru';
  if(locales[sourceLocale]&&locales[otherLocale]){
    locales[otherLocale]=normalizeTranslatedBlock(locales[sourceLocale],locales[otherLocale]);
  }
  if(!locales[sourceLocale]&&it&&(it.name||it.gives||it.text)){
    locales[sourceLocale]=cleanLocaleBlock({name:it.name,gives:it.gives,text:it.text});
  }
  return {sourceLocale,locales};
}

function localeMiss(block,label){
  const miss=[];
  if(!block||clean(block.name,60).trim().length<3)miss.push(label+': название');
  if(!block||clean(block.gives,300).trim().length<20)miss.push(label+': что даёт');
  if(!block||clean(block.text,60000).length<60)miss.push(label+': текст программы');
  return miss;
}

function protocolShape(text){
  return String(text||'').split(/\r?\n/).map(line=>{
    const p=protocolLine(line);if(!p)return '';
    return p.key+':'+(TRANSLATABLE_KEYS.has(p.key)?'<text>':p.value.trim());
  }).filter(Boolean);
}

function syncSourceFields(c,norm){
  const src=norm.locales[norm.sourceLocale]||norm.locales.ru||norm.locales.en;
  c.sourceLocale=norm.sourceLocale;
  c.locales=norm.locales;
  if(src){
    c.name=src.name;
    c.gives=src.gives;
    c.text=src.text;
  }
}

module.exports={
  GOALS,LEVELS,LANGS,normLocale,
  cleanLocaleBlock,normalizeCatalogText,localeMiss,
  translationFieldsFromText,applyTranslationFields,
  translationPayload,translationPayloadComplete,
  protocolShape,syncSourceFields
};
