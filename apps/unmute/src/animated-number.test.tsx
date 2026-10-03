import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimatedNumber } from './animated-number';

describe('AnimatedNumber',()=>{
  afterEach(()=>vi.restoreAllMocks());

  it('shows the target immediately when reduced motion is requested',()=>{
    vi.stubGlobal('matchMedia',()=>({matches:true}));
    render(<AnimatedNumber value={42} suffix="%" />);
    expect(screen.getByLabelText('42%').textContent).toBe('42%');
  });

  it('keeps the target aria-label stable while the visual value animates',()=>{
    vi.stubGlobal('matchMedia',()=>({matches:false}));
    vi.stubGlobal('requestAnimationFrame',()=>1);
    vi.stubGlobal('cancelAnimationFrame',()=>{});
    render(<AnimatedNumber value={7} />);
    expect(screen.getByLabelText('7')).toBeTruthy();
  });
});
