import { describe, expect, it } from 'vitest';
import { extractLegalBody } from './legal-page';

describe('legal pages inside the app', () => {
  it('keeps the article, drops scripts and keeps links between pages inside the app', () => {
    const html = '<html><body><main><article class="card"><h1>Политика</h1><script>alert(1)</script>'
      + '<a href="./delete-account.html">Удалить</a></article></main></body></html>';
    const body = extractLegalBody(html);
    expect(body).toContain('<h1>Политика</h1>');
    expect(body).not.toContain('script');
    expect(body).toContain('href="#/legal/delete-account"');
  });
});
