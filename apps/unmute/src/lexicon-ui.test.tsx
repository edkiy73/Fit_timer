import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { loadLexicon } from './lexicon/client';
import { speakWebText } from './speech-web';
import { dictionaries } from './i18n';
import { LexiconProvider, LexiconText } from './lexicon-ui';

vi.mock('./lexicon/client',()=>({loadLexicon:vi.fn()}));
vi.mock('./speech-web',()=>({
  speakWebText:vi.fn(async()=>true)
}));

const snapshot={
  schemaVersion:1 as const,
  revision:1,
  entries:[{
    id:'lex.work',
    revision:1,
    language:'en' as const,
    lemma:'work',
    forms:[{text:'work',kind:'lemma' as const}],
    pronunciation:{ipa:'wɜːk',ruReading:'уорк'},
    senses:[{
      id:'verb',
      partOfSpeech:'verb' as const,
      translations:{ru:['работать'],en:['work']},
      tags:[]
    },{
      id:'noun',
      partOfSpeech:'noun' as const,
      translations:{ru:['работа'],en:['work']},
      tags:[]
    }],
    examples:[{
      id:'ex-1',
      senseId:'verb',
      text:'I work remotely.',
      translations:{ru:'Я работаю удалённо.'},
      source:{sourceKind:'manual' as const}
    }],
    deprecated:false
  }]
};

function renderLexicon(text='I work today.',interactive=true){
  const queryClient=new QueryClient({
    defaultOptions:{queries:{retry:false}}
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider
        dictionaries={dictionaries}
        config={{locales:['ru'],default:'ru'}}
        storageKey="lexicon-ui-test.locale"
        systemLanguages={['ru']}
      >
        <LexiconProvider>
          <p><LexiconText text={text} interactive={interactive} /></p>
        </LexiconProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

describe('learner dictionary popup',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    vi.mocked(loadLexicon).mockResolvedValue({lexicon:snapshot,fromCache:false});
  });

  it('makes every English token clickable and opens translation, pronunciation and examples',async()=>{
    const user=userEvent.setup();
    renderLexicon();

    expect(await screen.findByRole('button',{name:'Перевести: I'})).toBeTruthy();
    expect(screen.getByRole('button',{name:'Перевести: work'})).toBeTruthy();
    expect(screen.getByRole('button',{name:'Перевести: today'})).toBeTruthy();

    await user.click(screen.getByRole('button',{name:'Перевести: work'}));

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading',{name:'work'})).toBeTruthy();
    expect(screen.getByText('работать')).toBeTruthy();
    expect(screen.getByText('/wɜːk/')).toBeTruthy();
    expect(screen.getByText('уорк')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Перевести: remotely'})).toBeTruthy();
    expect(screen.getByText('Я работаю удалённо.')).toBeTruthy();
    expect(speakWebText).toHaveBeenCalledWith('work','en-US');
  });

  it('keeps answer options plain until checked: a tap picks the answer, not a word',async()=>{
    renderLexicon('I work today.',false);
    expect(await screen.findByText('I work today.')).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Перевести: work'})).toBeNull();
  });

  it('saves a meaning to «Мои слова» and shows it as saved',async()=>{
    const user=userEvent.setup();
    renderLexicon();

    await user.click(await screen.findByRole('button',{name:'Перевести: work'}));
    // One button for the word, however many meanings it has.
    expect(await screen.findAllByRole('button',{name:'В мои слова'})).toHaveLength(1);
    const save=await screen.findByRole('button',{name:'В мои слова'});
    expect(save.getAttribute('aria-pressed')).toBe('false');
    await user.click(save);
    const saved=await screen.findByRole('button',{name:'В моих словах'});
    expect(saved.getAttribute('aria-pressed')).toBe('true');
    const {readWordsProgress}=await import('./sync');
    expect((await readWordsProgress()).items['lex.work|verb']?.deleted).toBeFalsy();
    await user.click(saved);
    expect(await screen.findByRole('button',{name:'В мои слова'})).toBeTruthy();
  });

  it('does not create a fake meaning when a clickable token is absent from lexicon',async()=>{
    const user=userEvent.setup();
    renderLexicon('Unknownword');

    await user.click(await screen.findByRole('button',{name:'Перевести: Unknownword'}));

    expect(await screen.findByText(/нет словарной статьи/)).toBeTruthy();
    expect(screen.getByRole('button',{name:'Произнести'})).toBeTruthy();
  });
});
