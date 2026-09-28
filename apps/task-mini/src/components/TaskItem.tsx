import { Button, Checkbox } from 'react-aria-components';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { Task } from '../domain';

interface Props {
  task: Task;
  onToggle: (id: string, done: boolean) => void;
  onRemove: (id: string) => void;
}

export function TaskItem({task, onToggle, onRemove}: Props){
  const {t} = useI18n();
  return (
    <li className="task" data-done={task.done || undefined}>
      <Checkbox className="task-check" isSelected={task.done} onChange={done => onToggle(task.id, done)}>
        <span className="box" aria-hidden="true" />
        <span className="title">{task.title}</span>
      </Checkbox>
      <Button className="remove" aria-label={t('tasks.removeNamed', {title: task.title})} onPress={() => onRemove(task.id)}>
        {t('tasks.remove')}
      </Button>
    </li>
  );
}
