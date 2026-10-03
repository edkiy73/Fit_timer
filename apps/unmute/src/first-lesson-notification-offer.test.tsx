import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';
import { DEFAULT_NOTIFICATION_SETTINGS } from './settings-data';

const readSettings=vi.fn();
const patchSettings=vi.fn();
const requestNotificationPermission=vi.fn();

vi.mock('./settings',()=>({
  readSettings:(...args:unknown[])=>readSettings(...args),
  patchSettings:(...args:unknown[])=>patchSettings(...args)
}));
vi.mock('./notification-native',()=>({
  nativeNotificationsAvailable:()=>true,
  requestNotificationPermission:(...args:unknown[])=>requestNotificationPermission(...args)
}));

import { FirstLessonNotificationOffer } from './first-lesson-notification-offer';

function renderOffer(eligible=true){
  return render(
    <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="offer-test.locale" systemLanguages={['ru']}>
      <FirstLessonNotificationOffer eligible={eligible} />
    </I18nProvider>
  );
}

describe('first lesson notification offer',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    readSettings.mockResolvedValue({notifications:DEFAULT_NOTIFICATION_SETTINGS});
    patchSettings.mockResolvedValue(undefined);
    requestNotificationPermission.mockResolvedValue('granted');
  });

  it('does not ask for permission before explicit opt-in',async()=>{
    renderOffer();
    expect(await screen.findByRole('heading',{name:'Напоминать в 19:00?'})).toBeTruthy();
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('enables 19:00 reminders and only then requests system permission',async()=>{
    const user=userEvent.setup();
    renderOffer();
    await user.click(await screen.findByRole('button',{name:'Напоминать в 19:00'}));

    await waitFor(()=>expect(patchSettings).toHaveBeenCalledTimes(1));
    expect(patchSettings.mock.calls[0][0]).toMatchObject({
      notificationOfferDoneAt:expect.any(String),
      notifications:{
        enabled:true,
        time:'19:00',
        daily:true,
        review:true,
        streak:true,
        changedAt:expect.any(String)
      }
    });
    expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
  });

  it('dismisses the offer permanently without requesting permission',async()=>{
    const user=userEvent.setup();
    renderOffer();
    await user.click(await screen.findByRole('button',{name:'Не сейчас'}));
    await waitFor(()=>expect(patchSettings).toHaveBeenCalledWith({
      notificationOfferDoneAt:expect.any(String)
    }));
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('does not show if reminders are already enabled or offer was handled',async()=>{
    readSettings.mockResolvedValueOnce({
      notificationOfferDoneAt:'2026-10-03T12:00:00.000Z',
      notifications:{...DEFAULT_NOTIFICATION_SETTINGS,enabled:true,changedAt:'2026-10-03T12:00:00.000Z'}
    });
    renderOffer();
    await waitFor(()=>expect(readSettings).toHaveBeenCalled());
    expect(screen.queryByRole('heading',{name:'Напоминать в 19:00?'})).toBeNull();
  });
});
