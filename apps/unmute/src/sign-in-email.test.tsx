import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, SignInForm } from '@appbase/ui-react/auth.js';

describe('sign-in email check (audit T5)',()=>{
  it('says the address looks mistyped instead of failing silently',async()=>{
    const user=userEvent.setup();
    const sendCode=vi.fn(async()=>({ok:true}));
    const client={sendCode,getSession:async()=>null,restoreSession:async()=>null,status:async()=>null,authFields:async()=>null} as never;
    render(<AuthProvider client={client}><SignInForm locale="ru" productName="UnMute" askHandle={false} /></AuthProvider>);
    await user.type(await screen.findByRole('textbox'),'not-an-email');
    await user.click(screen.getByRole('button',{name:'Прислать код'}));
    expect((await screen.findByRole('alert')).textContent).toBe('Проверь почту — похоже, в адресе опечатка.');
    expect(sendCode).not.toHaveBeenCalled();
  });
});
