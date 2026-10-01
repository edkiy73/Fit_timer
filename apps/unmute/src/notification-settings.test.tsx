import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';
import { DEFAULT_NOTIFICATION_SETTINGS } from './settings-data';

const patchSettings=vi.fn();
vi.mock('./settings',()=>({
  readSettings:async()=>({notifications:DEFAULT_NOTIFICATION_SETTINGS}),
  patchSettings:(...args:unknown[])=>patchSettings(...args)
}));
vi.mock('./sync',()=>({appDocs:{subscribe:()=>()=>{}}}));
vi.mock('./notification-native',()=>({
  nativeNotificationsAvailable:()=>false,
  notificationPermissionState:async()=>'unavailable',
  requestNotificationPermission:async()=>'unavailable',
  exactNotificationTimeAvailable:async()=>null,
  requestExactNotificationTime:async()=>null
}));

import { NotificationSettingsPanel } from './notification-settings';

describe('notification settings',()=>{
  it('puts the switch back and says so when saving fails',async()=>{
    patchSettings.mockRejectedValueOnce(new Error('offline'));
    const user=userEvent.setup();
    render(
      <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="notif-test.locale" systemLanguages={['ru']}>
        <NotificationSettingsPanel />
      </I18nProvider>
    );
    const toggle=await screen.findByRole('checkbox',{name:/Напоминать мне/});
    expect((toggle as HTMLInputElement).checked).toBe(false);
    await user.click(toggle);
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось сохранить');
    expect((toggle as HTMLInputElement).checked).toBe(false);
  });
});
