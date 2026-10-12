import {act,renderHook,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import bundled from '../../data/concept-catalog.json';
import {useCatalog} from './use-catalog';

afterEach(()=>vi.unstubAllGlobals());

it('W01 retry: failed refresh returns to bundled topics, not stale server release; recovery works',async()=>{
  const live=structuredClone(bundled);
  const category=live.categories.find(group=>group.interests.length>0);
  if(!category)throw Error('bundled catalogue fixture has no topics');
  category.interests[0]!.title='Only from the live server';

  const fetchMock=vi.fn()
    .mockResolvedValueOnce({ok:true,json:async()=>live})
    .mockRejectedValueOnce(new Error('network unavailable'))
    .mockResolvedValueOnce({ok:true,json:async()=>live});
  vi.stubGlobal('fetch',fetchMock);
  const hook=renderHook(()=>useCatalog());
  const names=()=>hook.result.current.data.categories.flatMap(group=>group.interests.map(topic=>topic.title));

  await waitFor(()=>expect(hook.result.current.source).toBe('live'));
  expect(names()).toContain('Only from the live server');

  act(()=>hook.result.current.retry());
  await waitFor(()=>expect(hook.result.current.source).toBe('offline'));
  expect(names()).not.toContain('Only from the live server');
  expect(hook.result.current.data.categories).toHaveLength(bundled.categories.length);

  act(()=>hook.result.current.retry());
  await waitFor(()=>expect(hook.result.current.source).toBe('live'));
  expect(names()).toContain('Only from the live server');
  expect(fetchMock).toHaveBeenCalledTimes(3);
  hook.unmount();
});

it('W01 rejects an empty live release and stays on bundled content',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({
    version:1,categories:[],tests:[]
  })}));
  const hook=renderHook(()=>useCatalog());
  await waitFor(()=>expect(hook.result.current.source).toBe('offline'));
  expect(hook.result.current.data.categories.length).toBeGreaterThan(0);
  hook.unmount();
});
