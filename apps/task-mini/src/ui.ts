import { createStorage } from '@appbase/core/storage.js';

interface TaskItem {
  id: string;
  title: string;
  done: boolean;
}

const storage = createStorage({
  dbName: 'taskmini/kv',
  storeName: 'kv'
});

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if(!element) throw new Error('task_mini_dom_missing:' + selector);
  return element;
}

const form = requiredElement<HTMLFormElement>('#task-form');
const input = requiredElement<HTMLInputElement>('#task-input');
const list = requiredElement<HTMLUListElement>('#task-list');
const empty = requiredElement<HTMLElement>('#empty');

let tasks: TaskItem[] = [];

async function persist(): Promise<void> {
  await storage.set('tasks', JSON.stringify(tasks));
}

function render(): void {
  list.replaceChildren();
  empty.hidden = tasks.length > 0;

  for(const task of tasks){
    const item = document.createElement('li');
    item.className = 'task' + (task.done ? ' done' : '');

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.setAttribute('aria-label', 'Готово');
    checkbox.addEventListener('change', async () => {
      task.done = checkbox.checked;
      await persist();
      render();
    });

    const title = document.createElement('span');
    title.textContent = task.title;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = 'Удалить';
    remove.addEventListener('click', async () => {
      tasks = tasks.filter(item => item.id !== task.id);
      await persist();
      render();
    });

    label.append(checkbox, title);
    item.append(label, remove);
    list.append(item);
  }
}

async function load(): Promise<void> {
  const raw = await storage.get('tasks');
  if(raw){
    try{
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed)) tasks = parsed.filter(item =>
        item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.done === 'boolean'
      );
    }catch(_){}
  }
  render();
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const title = input.value.trim();
  if(!title) return;
  tasks.unshift({id: crypto.randomUUID(), title, done:false});
  input.value = '';
  await persist();
  render();
  input.focus();
});

await load();
