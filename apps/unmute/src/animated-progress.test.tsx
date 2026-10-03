import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimatedProgressFill, AnimatedProgressRing } from './animated-progress';

describe('animated progress',()=>{
  afterEach(()=>vi.restoreAllMocks());

  it('shows the final value immediately with reduced motion',()=>{
    vi.stubGlobal('matchMedia',()=>({matches:true}));
    const {container}=render(<div><AnimatedProgressFill value={72} /></div>);
    expect((container.querySelector('.animated-progress-fill') as HTMLElement).style.width).toBe('72%');
  });

  it('keeps the final ring value in its accessibility label',()=>{
    vi.stubGlobal('matchMedia',()=>({matches:false}));
    vi.stubGlobal('requestAnimationFrame',()=>1);
    vi.stubGlobal('cancelAnimationFrame',()=>{});
    render(
      <AnimatedProgressRing value={68} label="Прогресс курса: 68%">
        <span>68%</span>
      </AnimatedProgressRing>
    );
    expect(screen.getByLabelText('Прогресс курса: 68%')).toBeTruthy();
  });
});
