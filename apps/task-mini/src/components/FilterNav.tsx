import { NavLink } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Task } from '../domain';

export function FilterNav({tasks}: {tasks: readonly Task[]}){
  const {t} = useI18n();
  const done = tasks.filter(task => task.done).length;
  const links = [
    {to: '/', label: t('tasks.all'), count: tasks.length},
    {to: '/active', label: t('tasks.active'), count: tasks.length - done},
    {to: '/done', label: t('tasks.done'), count: done}
  ];
  return (
    <nav className="filters" aria-label={t('tasks.filter')}>
      {links.map(link => (
        <NavLink key={link.to} to={link.to} end>
          {link.label} <span className="count">{link.count}</span>
        </NavLink>
      ))}
    </nav>
  );
}
