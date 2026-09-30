import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';
import { MyWordsView } from './my-words';
import { listSavedWords, savedWordStatus } from './saved-words';
import type { WordsProgressDocument } from './progress';

const lexicon={
  schemaVersion:1 as const,
  revision:1,
  entries:['home','work','go','see','buy','take','old'].map(lemma=>({
    id:'lex.'+lemma,
    revision:1,
    language:'en' as const,
    lemma,
    forms:[{text:lemma,kind:'lemma' as const}],
    senses:[{id:'s1',translations:{ru:['перевод '+lemma]},tags:[]}],
    examples:[],
    deprecated:false
  }))
};

function words(boxes:Record<string,number>,deleted:string[]=[]):WordsProgressDocument{
  const items:WordsProgressDocument['items']={};
  Object.entries(boxes).forEach(([lemma,box],index)=>{
    items['lex.'+lemma+'|s1']={lexemeId:'lex.'+lemma,senseId:'s1',box,due:0,at:'2026-09-2'+index+'T00:00:00Z',...(deleted.includes(lemma)?{deleted:true}:{})};
  });
  return {schemaVersion:1,items};
}

function runtime(doc:WordsProgressDocument,refresh=vi.fn(async()=>{})){
  return {words:doc,lexicon,status:'ready' as const,error:null,fromCache:false,refresh};
}

function renderWords(doc:WordsProgressDocument,remove=vi.fn(async()=>{}),refresh=vi.fn(async()=>{})){
  render(
    <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="my-words-test.locale" systemLanguages={['ru']}>
      <MyWordsView wordRuntime={runtime(doc,refresh)} remove={remove} />
    </I18nProvider>
  );
  return {remove,refresh};
}

describe('My words',()=>{
  it('lists live saved words newest first with their review stage',()=>{
    const list=listSavedWords(words({home:0,work:2,go:4},['go']),lexicon,'ru');
    expect(list.map(word=>[word.lemma,word.status])).toEqual([['work','learning'],['home','new']]);
    expect(savedWordStatus(4)).toBe('learned');
  });

  it('shows a hint when nothing is saved yet',()=>{
    renderWords(words({}));
    expect(screen.getByText(/сохраняй нужные/)).toBeTruthy();
  });

  it('searches and removes a word',async()=>{
    const user=userEvent.setup();
    const {remove,refresh}=renderWords(words({home:0,work:1,go:1,see:2,buy:3,take:4}));
    await user.type(screen.getByRole('searchbox',{name:'Найти слово'}),'wor');
    expect(screen.getByText('work')).toBeTruthy();
    expect(screen.queryByText('home')).toBeNull();
    await user.click(screen.getByRole('button',{name:'Убрать «work» из моих слов'}));
    expect(remove).toHaveBeenCalledWith('lex.work','s1');
    expect(refresh).toHaveBeenCalled();
  });
});
