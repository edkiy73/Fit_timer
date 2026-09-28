import { Outlet, useOutletContext, type RouteObject } from 'react-router';
import { AuthGate, useAuth } from '@appbase/ui-react/auth.js';
import { AdminPanel } from '@appbase/ui-react/admin.js';
import { filterTasks, type TaskFilter } from './domain';
import { AddTaskForm } from './components/AddTaskForm';
import { FilterNav } from './components/FilterNav';
import { TaskItem } from './components/TaskItem';
import { useTaskActions, useTasks, type TaskActions } from './tasks/queries';
import { taskAuth } from './auth';
import { taskAdmin } from './admin';

const EMPTY: Record<TaskFilter, string> = {
  all: 'Пока задач нет.',
  active: 'Все задачи выполнены.',
  done: 'Пока ничего не выполнено.'
};

function TaskLayout(){
  const {data: tasks = []} = useTasks();
  const actions = useTaskActions();
  const auth = useAuth();
  return (
    <main className="app">
      <header>
        <div className="account-row">
          <div>
            <div className="eyebrow">AppBase demo</div>
            <h1>Task Mini</h1>
            <p>Эталонное приложение на общем Core.</p>
          </div>
          <div className="account-chip">
            <span>{auth.session.email}</span>
            <button type="button" onClick={() => void auth.logout()}>Выйти</button>
          </div>
        </div>
      </header>
      <AddTaskForm onAdd={actions.add} />
      {actions.saveFailed && <p className="error" role="alert">Не удалось сохранить изменения.</p>}
      <FilterNav tasks={tasks} />
      <Outlet context={actions} />
    </main>
  );
}

function Layout(){
  return <AuthGate client={taskAuth} locale="ru" productName="Task Mini"><TaskLayout /></AuthGate>;
}

function TaskList({filter}: {filter: TaskFilter}){
  const {data, isPending, isError} = useTasks();
  const actions = useOutletContext<TaskActions>();
  if(isPending) return <p className="empty">Загружаю…</p>;
  if(isError) return <p className="error" role="alert">Не удалось прочитать задачи.</p>;
  const visible = filterTasks(data, filter);
  if(!visible.length) return <p className="empty">{EMPTY[filter]}</p>;
  return (
    <ul className="tasks" aria-live="polite">
      {visible.map(task => <TaskItem key={task.id} task={task} onToggle={actions.toggle} onRemove={actions.remove} />)}
    </ul>
  );
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      {index: true, element: <TaskList filter="all" />},
      {path: 'active', element: <TaskList filter="active" />},
      {path: 'done', element: <TaskList filter="done" />}
    ]
  },
  {
    path:'/admin',
    element:<AdminPanel client={taskAdmin} locale="ru" productName="Task Mini" />
  }
];
