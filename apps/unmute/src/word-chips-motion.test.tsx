import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';
import { WordChips } from './word-chips';

function renderChips(picked:string[],onChange:(picked:string[])=>void){
  return render(
    <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="chips-motion-test.locale" systemLanguages={['ru']}>
      <WordChips
        chips={[
          {id:'0',text:'I'},
          {id:'1',text:'like'},
          {id:'2',text:'coffee'}
        ]}
        picked={picked}
        onChange={onChange}
      />
    </I18nProvider>
  );
}

describe('WordChips motion interactions',()=>{
  it('moves a pool chip into the answer without changing its identity',async()=>{
    const onChange=vi.fn();
    const user=userEvent.setup();
    renderChips([],onChange);

    await user.click(screen.getByRole('button',{name:'I'}));
    expect(onChange).toHaveBeenCalledWith(['0']);
  });

  it('moves a picked chip back out of the answer',async()=>{
    const onChange=vi.fn();
    const user=userEvent.setup();
    renderChips(['0','1'],onChange);

    const remove=screen.getByRole('button',{name:/I/});
    await user.click(remove);
    expect(onChange).toHaveBeenCalledWith(['1']);
  });
});
