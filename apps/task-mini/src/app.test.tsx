import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './app';
import { loadTasks, saveTasks } from './tasks/repository';
import { createTask, filterTasks, TaskSchema } from './domain';

function renderApp(path = '/'){
  const router = createMemoryRouter(routes, {initialEntries: [path]});
  const client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}});
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}

beforeEach(async () => { await saveTasks([]); });

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

describe('repository', () => {
  it('drops malformed items instead of failing', async () => {
    const valid = createTask('ok', '1');
    await saveTasks([valid, {id: 2, title: null} as never]);
    expect(await loadTasks()).toEqual([valid]);
  });
});

describe('Task Mini UI', () => {
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
