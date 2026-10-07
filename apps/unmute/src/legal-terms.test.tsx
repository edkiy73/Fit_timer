import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';
import { TermsContent } from './legal-page';
import { DEFAULT_TERMS, fillTerms } from './legal-terms';

function renderTerms(){
  render(
    <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="terms-test.locale" systemLanguages={['ru']}>
      <TermsContent />
    </I18nProvider>
  );
}

afterEach(()=>{ vi.unstubAllGlobals(); });

describe('terms of use (decision 11)',()=>{
  it('the default text covers purchases, Plus, free days, refunds, AI and the honour rule',()=>{
    for(const part of ['Покупка курса','UnMute Plus','Бесплатные дни','Возвраты','Разговоры с ИИ','на свою совесть'])expect(DEFAULT_TERMS).toContain(part);
    const filled=fillTerms(DEFAULT_TERMS,{owner:'ИП Тест',country:'Сербия',email:'help@example.com',ageFrom:16});
    expect(filled).toContain('ИП Тест (Сербия)');
    expect(filled).toContain('help@example.com');
    expect(filled).toContain('с 16 лет');
    expect(filled).not.toMatch(/\{(owner|country|email|ageFrom)\}/);
    // Nothing typed in Admin yet: visible blanks to fill, never raw placeholders.
    expect(fillTerms('{owner}',null)).toBe('[владелец приложения]');
  });

  it('shows the text typed in Admin with the owner details',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({terms:'# Свои условия\n\nВладелец: {owner}',legal:{owner:'ИП Тест'}})})));
    renderTerms();
    expect(await screen.findByRole('heading',{name:'Свои условия'})).toBeTruthy();
    expect(screen.getByText('Владелец: ИП Тест')).toBeTruthy();
  });

  it('without a connection still shows the default terms',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline');}));
    renderTerms();
    expect(await screen.findByRole('heading',{name:'Условия использования UnMute'})).toBeTruthy();
  });
});
