import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from './sheet';

describe('Sheet motion',()=>{
  afterEach(()=>{
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens from a closed state and portals to document.body',()=>{
    const onClose=vi.fn();
    const {rerender,container}=render(
      <Sheet open={false} onClose={onClose} labelledBy="sheet-title" closeLabel="Закрыть">
        <h3 id="sheet-title">Панель</h3>
      </Sheet>
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(
      <Sheet open onClose={onClose} labelledBy="sheet-title" closeLabel="Закрыть">
        <h3 id="sheet-title">Панель</h3>
      </Sheet>
    );

    const dialog=screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(document.body.contains(dialog)).toBe(true);
    expect(container.contains(dialog)).toBe(false);
  });

  it('keeps the sheet mounted for its exit animation',()=>{
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia',()=>({matches:false}));
    const onClose=vi.fn();
    const {rerender}=render(
      <Sheet open onClose={onClose} labelledBy="sheet-title" closeLabel="Закрыть">
        <h3 id="sheet-title">Панель</h3>
      </Sheet>
    );

    expect(screen.getByRole('dialog')).toBeTruthy();

    rerender(
      <Sheet open={false} onClose={onClose} labelledBy="sheet-title" closeLabel="Закрыть">
        <h3 id="sheet-title">Панель</h3>
      </Sheet>
    );

    expect(screen.getByRole('dialog',{hidden:true}).className).toContain('is-leaving');
    act(()=>vi.advanceTimersByTime(270));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('unmounts immediately when reduced motion is requested',()=>{
    vi.stubGlobal('matchMedia',()=>({matches:true}));
    const {rerender}=render(
      <Sheet open onClose={()=>{}} labelledBy="sheet-title" closeLabel="Закрыть">
        <h3 id="sheet-title">Панель</h3>
      </Sheet>
    );
    rerender(
      <Sheet open={false} onClose={()=>{}} labelledBy="sheet-title" closeLabel="Закрыть">
        <h3 id="sheet-title">Панель</h3>
      </Sheet>
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
