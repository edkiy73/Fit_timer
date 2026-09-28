import { useState, type FormEvent } from 'react';
import { Button, Form, Input, TextField } from 'react-aria-components';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { TITLE_MAX } from '../domain';

export function AddTaskForm({onAdd}: {onAdd: (title: string) => void}){
  const {t} = useI18n();
  const [title, setTitle] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = title.trim();
    if(!value) return;
    onAdd(value);
    setTitle('');
  };

  return (
    <Form className="add-form" onSubmit={submit}>
      <TextField aria-label={t('tasks.new')} value={title} onChange={setTitle} maxLength={TITLE_MAX} autoComplete="off">
        <Input placeholder={t('tasks.new')} />
      </TextField>
      <Button type="submit" isDisabled={!title.trim()}>{t('tasks.add')}</Button>
    </Form>
  );
}
