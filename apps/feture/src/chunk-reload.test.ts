import {describe,expect,it,vi} from 'vitest';
import {RELOAD_KEY,RELOAD_WINDOW,isChunkError,reloadOnce,withChunkReload} from './chunk-reload';

const store=()=>{const m=new Map<string,string>();return {getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);},m};};
const chromeErr=()=>new TypeError('Failed to fetch dynamically imported module: https://app.kinhaze.com/assets/me-BzYW965v.js');

describe('chunk errors', () => {
  it('knows the browsers’ and Vite’s messages, nothing else', () => {
    expect(isChunkError(chromeErr())).toBe(true);
    expect(isChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkError(new TypeError('error loading dynamically imported module: /assets/x.js'))).toBe(true);
    expect(isChunkError(new Error('Unable to preload CSS for /assets/index-abc.css'))).toBe(true);
    expect(isChunkError(Object.assign(new Error('x'),{name:'ChunkLoadError'}))).toBe(true);
    expect(isChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkError(null)).toBe(false);
  });
});

describe('reload once', () => {
  it('reloads the first time and records when', () => {
    const s=store();const reload=vi.fn();
    expect(reloadOnce({storage:s,now:1_000_000,reload})).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(s.m.get(RELOAD_KEY)).toBe('1000000');
  });

  it('does not reload again within the window: no loop', () => {
    const s=store();const reload=vi.fn();
    reloadOnce({storage:s,now:1_000_000,reload});
    expect(reloadOnce({storage:s,now:1_000_000+5_000,reload})).toBe(false);
    expect(reloadOnce({storage:s,now:1_000_000+RELOAD_WINDOW-1,reload})).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again after the window (a later deploy)', () => {
    const s=store();const reload=vi.fn();
    reloadOnce({storage:s,now:1_000_000,reload});
    expect(reloadOnce({storage:s,now:1_000_000+RELOAD_WINDOW,reload})).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('never reloads without storage (no way to stop a loop)', () => {
    const reload=vi.fn();
    expect(reloadOnce({storage:null,now:1,reload})).toBe(false);
    const broken={getItem:()=>{throw new Error('denied');},setItem:()=>{throw new Error('denied');}};
    expect(reloadOnce({storage:broken,now:1,reload})).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('a screen import', () => {
  it('passes a loaded module through', async () => {
    const reload=vi.fn();
    await expect(withChunkReload(async()=>({A:1}),{storage:store(),now:1,reload})()).resolves.toEqual({A:1});
    expect(reload).not.toHaveBeenCalled();
  });

  it('a chunk error reloads once and keeps waiting; the second one reaches the error screen', async () => {
    const s=store();const reload=vi.fn();
    const first=withChunkReload(()=>Promise.reject(chromeErr()),{storage:s,now:1_000_000,reload})();
    const settled=await Promise.race([first.then(()=>'settled',()=>'settled'),new Promise(r=>setTimeout(()=>r('pending'),20))]);
    expect(settled).toBe('pending');
    expect(reload).toHaveBeenCalledTimes(1);
    // After the reload the same file is still missing: thrown, no second reload.
    await expect(withChunkReload(()=>Promise.reject(chromeErr()),{storage:s,now:1_003_000,reload})()).rejects.toThrow(/dynamically imported/);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('any other error is thrown at once, no reload', async () => {
    const reload=vi.fn();
    await expect(withChunkReload(()=>Promise.reject(new Error('boom')),{storage:store(),now:1,reload})()).rejects.toThrow('boom');
    expect(reload).not.toHaveBeenCalled();
  });
});
