import { useEffect } from 'react';
import { Link, Outlet, useNavigate, useOutletContext, type RouteObject } from 'react-router';
import { AuthProvider, SignInForm, useOptionalAuth } from '@appbase/ui-react/auth.js';
import { AdminPanel } from '@appbase/ui-react/admin.js';
import { hasEntitlement } from '@appbase/core/auth.js';
import { filterTasks, type TaskFilter } from './domain';
import { AddTaskForm } from './components/AddTaskForm';
import { FilterNav } from './components/FilterNav';
import { TaskItem } from './components/TaskItem';
import { useTaskActions, useTasks, type TaskActions } from './tasks/queries';
import { syncTasksNow } from './tasks/sync';
import { taskDocs } from './tasks/repository';
import { taskAuth } from './auth';
import { taskAdmin } from './admin';

const EMPTY: Record<TaskFilter, string> = {
  all: 'Пока задач нет.',
  active: 'Все задачи выполнены.',
  done: 'Пока ничего не выполнено.'
};

// Tasks work without an account (local-first); the account only adds sync between devices.
function AccountChip(){
  const auth = useOptionalAuth();
  const email = auth.session?.email;
  // Sign-in on this device (or restored session): merge local tasks with the account now.
  useEffect(() => { if(email) syncTasksNow(); }, [email]);
  if(auth.loading) return null;
  return (
    <div className="account-chip">
      {auth.session
        ? <><span>{auth.session.email}</span><Link to="/account">Аккаунт</Link></>
        : <Link to="/account">Войти</Link>}
    </div>
  );
}

function Header(){
  return (
    <header>
      <div className="account-row">
        <div>
          <div className="eyebrow">AppBase demo</div>
          <h1>Task Mini</h1>
          <p>Эталонное приложение на общем Core.</p>
        </div>
        <AccountChip />
      </div>
    </header>
  );
}

function TaskLayout(){
  const {data: tasks = []} = useTasks();
  const actions = useTaskActions();
  return (
    <main className="app">
      <Header />
      <AddTaskForm onAdd={actions.add} />
      {actions.saveFailed && <p className="error" role="alert">Не удалось сохранить изменения.</p>}
      <FilterNav tasks={tasks} />
      <Outlet context={actions} />
    </main>
  );
}

// Paid feature of the reference app: bought once (SKU "export", config/product.json → products).
export const EXPORT_SKU = 'export';

function ExportTasks(){
  const auth = useOptionalAuth();
  const {data: tasks = []} = useTasks();
  if(!hasEntitlement(auth.session, EXPORT_SKU)){
    return <p className="muted">Экспорт задач в файл — отдельная покупка. Пока её выдают в админке.</p>;
  }
  const download = () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tasks.json';
    link.click();
    URL.revokeObjectURL(url);
  };
  return <button type="button" className="text-button" onClick={download}>Скачать задачи ({tasks.length})</button>;
}

function AccountPage(){
  const auth = useOptionalAuth();
  const navigate = useNavigate();
  // Tasks stay on the device; the next sign-in merges them into that account.
  const signOut = async () => {
    await auth.logout();
    await taskDocs().detach();
    navigate('/');
  };
  if(auth.loading) return null;
  return (
    <main className="app">
      <p className="back"><Link to="/">← К задачам</Link></p>
      {auth.session ? (
        <section className="account">
          <h1>Аккаунт</h1>
          <p>{auth.session.email}{auth.session.handle ? ' · ' + auth.session.handle : ''}</p>
          <p className="muted">Задачи синхронизируются между устройствами, где выполнен вход.</p>
          <ExportTasks />
          <button type="button" className="text-button" onClick={() => void signOut()}>Выйти</button>
        </section>
      ) : (
        <>
          <p className="muted">Задачи уже сохраняются на этом устройстве. Войди, чтобы видеть их и на других.</p>
          <SignInForm locale="ru" productName="Task Mini" variant="inline" onSignedIn={() => navigate('/')} />
        </>
      )}
    </main>
  );
}

function Root(){
  return <AuthProvider client={taskAuth}><Outlet /></AuthProvider>;
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
    element: <Root />,
    children: [
      {
        element: <TaskLayout />,
        children: [
          {index: true, element: <TaskList filter="all" />},
          {path: 'active', element: <TaskList filter="active" />},
          {path: 'done', element: <TaskList filter="done" />}
        ]
      },
      {path: 'account', element: <AccountPage />}
    ]
  },
  {
    path:'/admin',
    element:<AdminPanel client={taskAdmin} locale="ru" productName="Task Mini" />
  }
];
