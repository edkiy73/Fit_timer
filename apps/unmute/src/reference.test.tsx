import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';
import { buildReference, hasReference, phraseDisplay, ReferenceView } from './reference';
import type { CourseSet } from './content/schema';

vi.mock('./speech-runtime', () => ({speakText:vi.fn(async () => true)}));

const lexicon = {
  schemaVersion:1 as const,
  revision:1,
  entries:[
    {id:'lex.hi', revision:1, language:'en' as const, lemma:'Nice to meet you.',
      forms:[{text:'Nice to meet you.', kind:'phrase' as const}],
      senses:[{id:'s1', translations:{ru:['Приятно познакомиться.']}, tags:[]}], examples:[], deprecated:false},
    {id:'lex.go', revision:1, language:'en' as const, lemma:'go',
      forms:[{id:'base', text:'go', kind:'lemma' as const}, {id:'past', text:'went', kind:'inflection' as const}, {id:'pp', text:'gone', kind:'inflection' as const}],
      senses:[{id:'s1', translations:{ru:['идти', 'ехать']}, tags:[]}], examples:[], deprecated:false}
  ]
};

const set = {
  resources:[
    {id:'phrase-bank', type:'phrase-collection', title:{ru:'Банк фраз'},
      groups:[{id:'g1', title:{ru:'Знакомство'}, items:[{lexemeId:'lex.hi', senseId:'s1'}, {lexemeId:'lex.missing'}]}]},
    {id:'verbs', type:'verb-table', title:{ru:'Глаголы'},
      items:[{lexemeId:'lex.go', baseFormId:'base', pastFormIds:['past'], participleFormIds:['pp']}]}
  ]
} as unknown as CourseSet;

function view(){
  const data = buildReference(set, lexicon, 'ru');
  render(
    <I18nProvider dictionaries={dictionaries} config={{locales:['ru'], default:'ru'}} storageKey="reference-test.locale" systemLanguages={['ru']}>
      <ReferenceView phrases={data.phrases} verbs={data.verbs} onBack={() => undefined} />
    </I18nProvider>
  );
}

describe('Справочник', () => {
  it('resolves phrases and verb forms through the dictionary, skipping unknown entries', () => {
    const data = buildReference(set, lexicon, 'ru');
    expect(data.phrases).toEqual([{id:'g1', title:'Знакомство', rows:[{key:'g1:0', text:'Nice to meet you.', translation:'Приятно познакомиться.'}]}]);
    expect(data.verbs).toEqual([{key:'lex.go', base:'go', past:'went', participle:'gone', translation:'идти, ехать'}]);
    expect(hasReference(set)).toBe(true);
    expect(hasReference({resources:[]} as unknown as CourseSet)).toBe(false);
  });

  it('shows the phrase as written: the author text first, else a tidied lemma', () => {
    const withText = {resources:[{id:'b', type:'phrase-collection', title:{ru:'Б'}, groups:[{id:'g', title:{ru:'Г'},
      items:[{lexemeId:'lex.hi', text:'Nice to meet you!', translation:{ru:'Рад знакомству!'}}]}]}]} as unknown as CourseSet;
    expect(buildReference(withText, lexicon, 'ru').phrases[0]!.rows[0]).toMatchObject({text:'Nice to meet you!', translation:'Рад знакомству!'});
    expect(phraseDisplay("hi, i'm ivan. nice to meet you")).toBe("Hi, I'm ivan. Nice to meet you");
    expect(phraseDisplay('where are you from')).toBe('Where are you from');
  });

  it('hides translations and verb forms for self-check, as in the old app', async () => {
    const user = userEvent.setup();
    view();
    expect(screen.getByText('Приятно познакомиться.')).toBeTruthy();
    await user.click(screen.getByRole('button', {name:'Скрыть перевод'}));
    expect(screen.queryByText('Приятно познакомиться.')).toBeNull();

    await user.click(screen.getByRole('tab', {name:'Глаголы'}));
    expect(screen.getByText('go')).toBeTruthy();
    await user.click(screen.getByRole('button', {name:'Показать все формы'}));
    expect(screen.getByText('go — went — gone')).toBeTruthy();
  });
});
