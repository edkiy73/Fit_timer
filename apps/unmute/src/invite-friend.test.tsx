import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';
import { InviteFriendView } from './invite-friend';
import { ReferralError, inviteLink, pendingReferral, rememberPendingReferral, type ReferralInfo } from './referral';

const info:ReferralInfo={code:'ABCD2345',bonusDays:7,daysNeeded:3,invited:0,rewarded:0,referred:null,canJoin:true};

function renderView(extra:Partial<ReferralInfo>={},onShare=vi.fn(async()=>'copied' as const),onJoin=vi.fn(async(_code:string)=>{})){
  render(
    <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="invite-test.locale" systemLanguages={['ru']}>
      <InviteFriendView info={{...info,...extra}} onShare={onShare} onJoin={onJoin} />
    </I18nProvider>
  );
  return {onShare,onJoin};
}

afterEach(()=>localStorage.clear());

describe('invite a friend (decision 17)',()=>{
  it('explains the bonus, shows the code and shares the link',async()=>{
    const user=userEvent.setup();
    const {onShare}=renderView();
    expect(screen.getByText('Когда друг войдёт по твоей ссылке и пройдёт 3 дня курса, вы оба получите UnMute Plus на 7 дней.')).toBeTruthy();
    expect(screen.getByText('ABCD2345')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Поделиться ссылкой'}));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Ссылка скопирована — отправь её другу.')).toBeTruthy();
  });

  it('takes a friend’s code and says plainly why it did not fit',async()=>{
    const user=userEvent.setup();
    const onJoin=vi.fn(async(_code:string)=>{ throw new ReferralError('own_code'); });
    renderView({},undefined,onJoin);
    await user.click(screen.getByText('Есть код от друга?'));
    await user.type(screen.getByRole('textbox',{name:'Код друга'}),'abcd-2345');
    await user.click(screen.getByRole('button',{name:'Применить'}));
    expect(onJoin).toHaveBeenCalledWith('ABCD2345');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Это твой собственный код.')).toBeTruthy();
  });

  it('shows the invite state instead of the code field once invited',()=>{
    renderView({referred:{rewarded:false},canJoin:false,invited:2,rewarded:1});
    expect(screen.queryByText('Есть код от друга?')).toBeNull();
    expect(screen.getByText('Ты по приглашению друга: пройди 3 дня курса — и вы оба получите Plus.')).toBeTruthy();
    expect(screen.getByText('По твоей ссылке пришли: 2 · получили бонус: 1')).toBeTruthy();
  });

  it('remembers a code from an invite link until sign-in',()=>{
    rememberPendingReferral('abcd2345');
    expect(pendingReferral()).toBe('ABCD2345');
    rememberPendingReferral('short');
    expect(pendingReferral()).toBe('ABCD2345');
    expect(inviteLink('ABCD2345')).toMatch(/#\/invite\/ABCD2345$/);
  });
});
