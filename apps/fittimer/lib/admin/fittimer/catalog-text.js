'use strict';

/* Запись каталога = одна программа V2 (механика + тексты исходного языка) и текстовые
   накладки по языкам: locales[lang] = {name, gives, texts}. Здесь — нормализация записи
   и проверка готовности языков. Структура у языков одна по построению, поэтому
   отдельной проверки «RU/EN совпадают по форме» больше нет. */

const { clampLine, clampText } = require('../../../../../packages/core/server/util');
const CP = require('../../fit-catalog-program');

const GOALS = ['slim','tone','glut','core','power','relief','flex','back','post','cardio'];
const LEVELS = ['Новичок','Средний','Продвинутый'];
const LANGS = CP.LANGS;

const normLocale=v=>LANGS.includes(String(v||'').toLowerCase())?String(v).toLowerCase():'ru';

function cleanLocaleBlock(v,program){
  if(!v || typeof v!=='object') return null;
  return {
    name:clampLine(v.name,60),
    gives:clampText(v.gives,300),
    texts:CP.cleanTexts(v.texts,program)
  };
}

/* Сырой объект записи (заявка, черновик, правка админа) → программа + накладки.
   Накладка исходного языка — правка текстов самой программы: применяем её к программе
   и снимаем заново, чтобы исходник всегда совпадал с программой. */
function normalizeCatalog(it,fallbackSource){
  const sourceLocale=normLocale((it&&it.sourceLocale)||fallbackSource);
  const cleaned=CP.cleanCatalogProgram(it&&it.program);
  let program=cleaned.program;
  const src=(it&&it.locales&&typeof it.locales==='object')?it.locales:{};
  const locales={};
  LANGS.forEach(lang=>{
    const block=cleanLocaleBlock(src[lang],program);
    if(block)locales[lang]=block;
  });
  if(!locales[sourceLocale]&&it&&(it.name||it.gives)){
    locales[sourceLocale]={name:clampLine(it.name,60),gives:clampText(it.gives,300),texts:CP.cleanTexts(null,program)};
  }
  if(program){
    if(locales[sourceLocale])program=CP.applyTexts(program,locales[sourceLocale].texts);
    const own=CP.textsOf(program);
    locales[sourceLocale]=Object.assign({name:'',gives:''},locales[sourceLocale]||{},{texts:own});
  }
  return {sourceLocale,program,exCount:cleaned.exCount,errors:cleaned.errors,locales};
}

// Чего не хватает языку. Для исходного языка тексты — сама программа.
function localeMiss(block,sourceTexts,label){
  const miss=[];
  if(!block||String(block.name||'').trim().length<3)miss.push(label+': название');
  if(!block||String(block.gives||'').trim().length<20)miss.push(label+': что даёт');
  if(!block||!CP.textsComplete(sourceTexts,block.texts))miss.push(label+': тексты программы');
  return miss;
}

// Что не так с самой программой — по-человечески, для списка «не хватает».
function programMiss(norm){
  if(!norm.program)return ['программа'];
  if(norm.errors.includes('exercises.min'))return ['хотя бы три упражнения'];
  return norm.errors.length?['программа: '+norm.errors.slice(0,3).join(', ')]:[];
}

function syncSourceFields(c,norm){
  const src=norm.locales[norm.sourceLocale]||{name:'',gives:''};
  c.sourceLocale=norm.sourceLocale;
  c.locales=norm.locales;
  c.program=norm.program;
  c.exCount=norm.exCount;
  c.name=src.name||'';
  c.gives=src.gives||'';
}

module.exports={
  GOALS,LEVELS,LANGS,normLocale,
  cleanLocaleBlock,normalizeCatalog,localeMiss,programMiss,syncSourceFields
};
