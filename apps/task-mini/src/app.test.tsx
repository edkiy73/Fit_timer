import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './app';
import { I18nProvider, LanguagePicker, missingKeys, offeredLocales, resolveLocale } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';
import { loadTasks, saveTasks } from './tasks/repository';
import {
  createTask, filterTasks, mergeTaskDocuments, parseTaskRecords, recordsFromTasks,
  serializeTaskRecords, tasksFromRecords, TaskSchema
} from './domain';

function renderApp(path = '/'){
  const router = createMemoryRouter(routes, {initialEntries: [path]});
  const client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}});
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}

const signIn = (owned: string[] = []) =>
  localStorage.setItem('task-mini.auth.session', JSON.stringify({
    owned,
    email:'demo@example.com',
    deviceId:'device-test',
    syncToken:'token-test',
    handle:'@demo',
    locale:'ru',
    sub:null,
    premium:false,
    fresh:false
  }));

beforeEach(async () => {
  localStorage.removeItem('task-mini.auth.session');
  localStorage.setItem('task-mini.locale', 'ru');
  await saveTasks([]);
});

describe('domain', () => {
  it('validates tasks at the boundary', () => {
    expect(TaskSchema.safeParse({id: 'a', title: '  ', done: false}).success).toBe(false);
    expect(TaskSchema.safeParse({id: 'a', title: 'x'.repeat(121), done: false}).success).toBe(false);
    expect(createTask(' Купить хлеб ', 'a')).toEqual({id: 'a', title: 'Купить хлеб', done: false});
  });

  it('filters by status', () => {
    const tasks = [createTask('a', '1'), {...createTask('b', '2'), done: true}];
    expect(filterTasks(tasks, 'active').map(t => t.id)).toEqual(['1']);
    expect(filterTasks(tasks, 'done').map(t => t.id)).toEqual(['2']);
    expect(filterTasks(tasks, 'all')).toHaveLength(2);
  });
});

describe('synced task records', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();

  it('keeps unchanged records, stamps changes and leaves tombstones for removed tasks', () => {
    const a = createTask('a', 'a'), b = createTask('b', 'b');
    const first = recordsFromTasks({}, [a, b], at(1));
    const second = recordsFromTasks(first, [{...a, done: true}], at(2));
    expect(second.a).toMatchObject({done: true, at: at(2)});
    expect(second.b).toEqual({at: at(2), deleted: true});
    expect(tasksFromRecords(second)).toEqual([{...a, done: true}]);
    expect(tasksFromRecords(first).map(t => t.id)).toEqual(['a', 'b']);
  });

  it('merges two devices per task: newer change wins and deletions do not come back', () => {
    const a = createTask('a', 'a'), b = createTask('b', 'b'), c = createTask('c', 'c');
    const base = recordsFromTasks({}, [a, b], at(1));
    const phone = serializeTaskRecords(recordsFromTasks(base, [c, {...a, done: true}, b], at(5)));
    const laptop = serializeTaskRecords(recordsFromTasks(base, [a], at(6)));
    const merged = tasksFromRecords(parseTaskRecords(mergeTaskDocuments(phone, laptop)));
    expect(merged.map(t => t.id).sort()).toEqual(['a', 'c']);
    // The laptop never touched "a", so the phone's later change stays.
    expect(merged.find(t => t.id === 'a')?.done).toBe(true);
  });

  it('drops malformed documents and records', () => {
    expect(parseTaskRecords('not json')).toEqual({});
    expect(parseTaskRecords(JSON.stringify({items: {x: {id: 'y', title: 't', done: false, at: at(1), created: at(1)}}}))).toEqual({});
  });
});

describe('repository', () => {
  it('drops malformed items instead of failing', async () => {
    const valid = createTask('ok', '1');
    await saveTasks([valid, {id: 2, title: null} as never]);
    expect(await loadTasks()).toEqual([valid]);
  });
});

describe('interface language', () => {
  it('has the same keys in every dictionary', () => {
    expect(missingKeys(dictionaries)).toEqual({});
  });

  it('switches the whole interface and remembers the choice on the device', async () => {
    const user = userEvent.setup();
    renderApp('/account');
    await user.selectOptions(await screen.findByRole('combobox', {name: 'Язык'}), 'en');
    expect(await screen.findByRole('heading', {name: 'Account'})).toBeTruthy();
    expect(screen.getByRole('link', {name: '← Back to tasks'})).toBeTruthy();
    expect(localStorage.getItem('task-mini.locale')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('follows the system language by default and offers no switch with one locale', () => {
    expect(resolveLocale('system', ['ru', 'en'], ['de-DE', 'en-GB'])).toBe('en');
    expect(resolveLocale('system', ['ru', 'en'], ['de-DE'])).toBe('ru');
    expect(offeredLocales(dictionaries, {locales: ['ru'], default: 'ru'})).toEqual(['ru']);
    render(<I18nProvider dictionaries={dictionaries} config={{locales: ['ru']}} storageKey="one.locale">
      <LanguagePicker label="Язык" systemLabel="Как в системе" />
    </I18nProvider>);
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('Task Mini UI', () => {
  it('keeps the paid export locked until the account owns it', async () => {
    signIn();
    await saveTasks([createTask('Первая', '1')]);
    renderApp('/account');
    expect(await screen.findByText(/Экспорт задач в файл — отдельная покупка/)).toBeTruthy();
    expect(screen.queryByRole('button', {name: /Скачать задачи/})).toBeNull();
  });

  it('opens the paid export for an account that owns the SKU', async () => {
    signIn(['export']);
    await saveTasks([createTask('Первая', '1'), createTask('Вторая', '2')]);
    renderApp('/account');
    expect(await screen.findByRole('button', {name: 'Скачать задачи (2)'})).toBeTruthy();
  });

  it('works without an account and offers sign-in', async () => {
    const user = userEvent.setup();
    const router = renderApp();
    expect(await screen.findByText('Пока задач нет.')).toBeTruthy();
    await user.type(screen.getByRole('textbox', {name: 'Новая задача'}), 'Без аккаунта');
    await user.click(screen.getByRole('button', {name: 'Добавить'}));
    expect(await screen.findByText('Без аккаунта')).toBeTruthy();

    await user.click(screen.getByRole('link', {name: 'Войти'}));
    expect(router.state.location.pathname).toBe('/account');
    expect(await screen.findByRole('heading', {name: 'Аккаунт'})).toBeTruthy();
    expect(screen.getByRole('textbox', {name: 'Email'})).toBeTruthy();
  });

  it('shows the signed-in account and signs out without losing local tasks', async () => {
    signIn();
    await saveTasks([createTask('Моя задача', '1')]);
    const user = userEvent.setup();
    const router = renderApp();
    expect(await screen.findByText('demo@example.com')).toBeTruthy();
    await user.click(screen.getByRole('link', {name: 'Аккаунт'}));
    await user.click(await screen.findByRole('button', {name: 'Выйти'}));
    expect(router.state.location.pathname).toBe('/');
    expect(await screen.findByRole('link', {name: 'Войти'})).toBeTruthy();
    expect(await screen.findByText('Моя задача')).toBeTruthy();
  });

  it('adds, completes, filters and removes a task, persisting through Core storage', async () => {
    const user = userEvent.setup();
    const router = renderApp();
    expect(await screen.findByText('Пока задач нет.')).toBeTruthy();

    const add = screen.getByRole('button', {name: 'Добавить'});
    expect(add.hasAttribute('disabled')).toBe(true);
    await user.type(screen.getByRole('textbox', {name: 'Новая задача'}), 'Купить хлеб');
    await user.click(add);
    expect(await screen.findByText('Купить хлеб')).toBeTruthy();
    expect((screen.getByRole('textbox', {name: 'Новая задача'}) as HTMLInputElement).value).toBe('');

    await user.click(screen.getByRole('checkbox', {name: 'Купить хлеб'}));
    expect((screen.getByRole('checkbox', {name: 'Купить хлеб'}) as HTMLInputElement).checked).toBe(true);
    expect((await loadTasks())[0]?.done).toBe(true);

    await user.click(screen.getByRole('link', {name: /Активные/}));
    expect(router.state.location.pathname).toBe('/active');
    expect(await screen.findByText('Все задачи выполнены.')).toBeTruthy();

    await user.click(screen.getByRole('link', {name: /Готовые/}));
    const list = await screen.findByRole('list');
    await user.click(within(list).getByRole('button', {name: 'Удалить «Купить хлеб»'}));
    expect(await screen.findByText('Пока ничего не выполнено.')).toBeTruthy();
    expect(await loadTasks()).toEqual([]);
  });

  it('shows stored tasks on start and marks the active filter', async () => {
    await saveTasks([createTask('Первая', '1'), {...createTask('Вторая', '2'), done: true}]);
    renderApp('/done');
    expect(await screen.findByText('Вторая')).toBeTruthy();
    expect(screen.queryByText('Первая')).toBeNull();
    expect(screen.getByRole('link', {name: /Готовые/}).getAttribute('aria-current')).toBe('page');
  });
});
