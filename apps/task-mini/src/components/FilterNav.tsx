import { NavLink } from 'react-router';
import type { Task } from '../domain';

export function FilterNav({tasks}: {tasks: readonly Task[]}){
  const done = tasks.filter(task => task.done).length;
  const links = [
    {to: '/', label: 'Все', count: tasks.length},
    {to: '/active', label: 'Активные', count: tasks.length - done},
    {to: '/done', label: 'Готовые', count: done}
  ];
  return (
    <nav className="filters" aria-label="Фильтр задач">
      {links.map(link => (
        <NavLink key={link.to} to={link.to} end>
          {link.label} <span className="count">{link.count}</span>
        </NavLink>
      ))}
    </nav>
  );
}
