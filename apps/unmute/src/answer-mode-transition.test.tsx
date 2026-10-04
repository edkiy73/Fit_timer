import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerModeTransition } from './answer-mode-transition';

describe('AnswerModeTransition',()=>{
  afterEach(()=>vi.restoreAllMocks());

  it('renders the active mode content with a stable wrapper',()=>{
    const {rerender,container}=render(
      <AnswerModeTransition mode="chips"><span>chips</span></AnswerModeTransition>
    );
    expect(screen.getByText('chips')).toBeTruthy();
    const wrapper=container.querySelector('.answer-mode-transition');
    expect(wrapper?.getAttribute('data-mode')).toBe('chips');

    rerender(
      <AnswerModeTransition mode="write"><span>write</span></AnswerModeTransition>
    );
    expect(screen.getByText('write')).toBeTruthy();
    expect(wrapper?.getAttribute('data-mode')).toBe('write');
  });

  it('skips height animation when reduced motion is enabled',()=>{
    vi.stubGlobal('matchMedia',()=>({matches:true}));
    const {rerender,container}=render(
      <AnswerModeTransition mode="chips"><div style={{height:40}}>chips</div></AnswerModeTransition>
    );
    rerender(
      <AnswerModeTransition mode="write"><div style={{height:80}}>write</div></AnswerModeTransition>
    );
    const wrapper=container.querySelector('.answer-mode-transition') as HTMLElement;
    expect(wrapper.style.transition).toBe('');
  });
});
