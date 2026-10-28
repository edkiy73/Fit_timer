import {describe,expect,it} from 'vitest';
import {domToMd,hasLongWord,mdImages,mdToDom} from './rich-md';

const IMG='018f0000-0000-7000-8000-0000000000aa';
const round=(md:string)=>{const el=document.createElement('div');mdToDom(el,md,{src:()=>'blob:x'});return {el,md:domToMd(el)};};

describe('RichEditor Markdown ⇄ DOM',()=>{
 it('keeps the marks the posts show',()=>{
  const md=`## Заголовок\n\n**жирный**, *курсив*, ~~зачёркнутый~~ и [ссылка](https://example.com)\nвторая строка\n\n- один\n- два\n\n1. первый\n2. второй\n\n> цитата\n> дальше\n\n![](media:${IMG})\n\nконец`;
  const {el,md:back}=round(md);
  expect(back).toBe(md);
  expect(el.querySelector('h4')?.textContent).toBe('Заголовок');
  expect(el.querySelector('figure')?.dataset.media).toBe(IMG);
  expect(el.querySelector('figure')?.contentEditable).toBe('false');
 });
 it('never turns text into markup: tags stay text, odd links and pictures fall away',()=>{
  const {el,md}=round('<img src=x onerror=alert(1)> [x](javascript:alert(1))');
  expect(el.querySelector('img')).toBeNull();
  expect(md).toBe('<img src=x onerror=alert(1)> [x](javascript:alert(1))');
  const host=document.createElement('div');
  const p=document.createElement('p');const a=document.createElement('a');a.href='javascript:alert(1)';a.textContent='жми';p.append('до ',a);
  const s=document.createElement('script');s.textContent='bad()';const f=document.createElement('figure');f.dataset.media='../etc';
  host.append(p,s,f);
  expect(domToMd(host)).toBe('до жми\n\nbad()');
 });
 it('a plain line that only looks like markup stays literal',()=>{
  const el=document.createElement('div');const p=document.createElement('p');p.textContent='- не список';el.append(p);
  expect(domToMd(el)).toBe('\\- не список');
  expect(round('\\- не список').md).toBe('\\- не список');
 });
 it('lists the pictures in order and spots endless words (links do not count)',()=>{
  expect(mdImages(`a\n\n![](media:${IMG})\n\n![x](media:${IMG.replace('aa','bb')})`)).toEqual([IMG,IMG.replace('aa','bb')]);
  expect(hasLongWord('a'.repeat(121))).toBe(true);
  expect(hasLongWord('см. https://example.com/'+'a'.repeat(300))).toBe(false);
  expect(hasLongWord(`![](media:${IMG}) обычный текст`)).toBe(false);
 });
});
