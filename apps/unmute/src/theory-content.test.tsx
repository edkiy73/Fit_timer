import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';
import { describe, expect, it } from 'vitest';
import type { Activity } from './content/schema';
import { TheoryContent, markdownToHtml } from './theory-content';

type Theory = Extract<Activity, {type:'theory'}>;
const render = (ui: ReactElement) => rtlRender(
  <I18nProvider dictionaries={dictionaries} config={{locales:['ru'], default:'ru'}} storageKey="theory-test.locale" systemLanguages={['ru']}>{ui}</I18nProvider>
);
const theory = (body: string, format: Theory['format'] = 'html'): Theory =>
  ({id:'t', revision:1, revisionProgress:'preserve', type:'theory', tags:[], lexiconRefs:[], format, body:{ru:body}}) as Theory;

describe('theory content', () => {
  it('renders course tables as tables, English and Russian in their own cells', () => {
    const {container} = render(<TheoryContent locale="ru" activity={theory('<table class="eng"><tr><td>I worked</td><td class="ru">прошлое на глаголе</td></tr></table>')} />);
    const cells = container.querySelectorAll('td');
    expect(cells).toHaveLength(2);
    expect(cells[0]!.textContent).toBe('I worked');
    expect(cells[1]!.className).toBe('is-ru');
  });

  it('keeps an example and its translation apart and styles notes', () => {
    const {container} = render(<TheoryContent locale="ru" activity={theory('<div class="ex">It works.<span class="ru">Оно работает.</span></div><div class="warn">Так нельзя</div>')} />);
    expect(container.querySelector('.theory-example .is-ru')?.textContent).toBe('Оно работает.');
    expect(container.querySelector('.theory-callout.is-warn')?.textContent).toBe('Так нельзя');
  });

  it('drops scripts, inline handlers and unsafe links', () => {
    const {container} = render(<TheoryContent locale="ru" activity={theory('<p onclick="alert(1)">Текст<script>alert(2)</script><a href="javascript:alert(3)">ссылка</a><img src="http://x/y.png"></p>')} />);
    expect(container.innerHTML).not.toContain('script');
    expect(container.innerHTML).not.toContain('onclick');
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/ссылка/)).toBeTruthy();
  });

  it('understands the Markdown authors use: headings, lists, tables, notes, images', () => {
    const html = markdownToHtml('## Шаг 1\n- **I** work\n- you work\n\n| I | я |\n|---|---|\n| you | ты |\n\n> Важно\n\n![схема](https://example.com/a.png)');
    expect(html).toContain('<h4>Шаг 1</h4>');
    expect(html).toContain('<li><b>I</b> work</li>');
    expect(html).toContain('<table><tr><td>I</td><td>я</td></tr><tr><td>you</td><td>ты</td></tr></table>');
    expect(html).toContain('<div class="warn">Важно</div>');
    expect(html).toContain('<img alt="схема" src="https://example.com/a.png">');
  });

  it('turns plain text with bullets into paragraphs and a list', () => {
    const {container} = render(<TheoryContent locale="ru" activity={theory('Скажи вслух.\n\n• I work here.\n• Do you work here?', 'text')} />);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('p')?.textContent).toBe('Скажи вслух.');
  });
});
