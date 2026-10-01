import { describe, expect, it } from 'vitest';
import { extractLegalBody } from './legal-page';
import privacyPage from '../public/privacy.html?raw';

describe('legal pages inside the app', () => {
  it('keeps the article, drops scripts and keeps links between pages inside the app', () => {
    const html = '<html><body><main><article class="card"><h1>Политика</h1><script>alert(1)</script>'
      + '<a href="./delete-account.html">Удалить</a></article></main></body></html>';
    const body = extractLegalBody(html);
    expect(body).toContain('<h1>Политика</h1>');
    expect(body).not.toContain('script');
    expect(body).toContain('href="#/legal/delete-account"');
  });

  it('shows the owner and contacts typed in Admin, and keeps the page text without them', () => {
    const page = privacyPage;
    const filled = extractLegalBody(page, {owner:'ИП Иванов И. И.', country:'Сербия', email:'help@unmute.app', ageFrom:16});
    expect(filled).toContain('Данные обрабатывает <span data-legal="operator">ИП Иванов И. И., Сербия</span>');
    expect(filled).toContain('href="mailto:help@unmute.app">help@unmute.app</a>');
    expect(filled).not.toContain('edkiy73@gmail.com');
    expect(filled).toContain('<span data-legal="ageFrom">16</span>');
    const plain = extractLegalBody(page, null);
    expect(plain).toContain('владелец приложения UnMute: English for Expats');
    expect(plain).not.toContain('<script');
  });
});
