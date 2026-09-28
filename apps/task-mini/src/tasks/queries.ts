import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTask, type Task } from '../domain';
import { loadTasks, saveTasks } from './repository';

const TASKS = ['tasks'] as const;

export function useTasks(){
  return useQuery({queryKey: TASKS, queryFn: loadTasks});
}

export type TaskActions = ReturnType<typeof useTaskActions>;

/** Every change is "next list from the current list": the cache updates at once
 *  (optimistic), storage is written after, and a failed write rolls the cache back. */
export function useTaskActions(){
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: saveTasks,
    onMutate: async (next: Task[]) => {
      await client.cancelQueries({queryKey: TASKS});
      const previous = client.getQueryData<Task[]>(TASKS);
      client.setQueryData(TASKS, next);
      return {previous};
    },
    onError: (_error, _next, context) => {
      if(context?.previous) client.setQueryData(TASKS, context.previous);
    }
  });
  const update = (change: (tasks: Task[]) => Task[]) =>
    save.mutate(change(client.getQueryData<Task[]>(TASKS) ?? []));

  return {
    add: (title: string) => update(tasks => [createTask(title), ...tasks]),
    toggle: (id: string, done: boolean) => update(tasks => tasks.map(task => task.id === id ? {...task, done} : task)),
    remove: (id: string) => update(tasks => tasks.filter(task => task.id !== id)),
    saveFailed: save.isError
  };
}
