import { useState, type FormEvent } from 'react';
import { Button, Form, Input, TextField } from 'react-aria-components';
import { TITLE_MAX } from '../domain';

export function AddTaskForm({onAdd}: {onAdd: (title: string) => void}){
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
      <TextField aria-label="Новая задача" value={title} onChange={setTitle} maxLength={TITLE_MAX} autoComplete="off">
        <Input placeholder="Новая задача" />
      </TextField>
      <Button type="submit" isDisabled={!title.trim()}>Добавить</Button>
    </Form>
  );
}
