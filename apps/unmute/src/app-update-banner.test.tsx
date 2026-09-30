import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';
import { AppUpdateProvider, UpdateBanner } from './app-update';

function phone(channel:'direct'|'store',update:Record<string,unknown>){
  const native={
    getDistribution:vi.fn(async()=>({channel,versionCode:1005,versionName:'0.1.5'})),
    getUpdateState:vi.fn(async()=>({status:'idle'})),
    downloadUpdate:vi.fn(async()=>({status:'in_progress'})),
    installUpdate:vi.fn(async()=>({status:'installer_opened'})),
    openExternal:vi.fn(async()=>undefined),
    cancelUpdate:vi.fn(async()=>undefined)
  };
  (globalThis as unknown as {Capacitor:unknown}).Capacitor={isNativePlatform:()=>true,getPlatform:()=>'android',Plugins:{UnMuteUpdate:native}};
  vi.stubGlobal('fetch',vi.fn(async()=>({json:async()=>({update:{android:update}})})));
  render(
    <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="update-test.locale" systemLanguages={['ru']}>
      <AppUpdateProvider><UpdateBanner /></AppUpdateProvider>
    </I18nProvider>
  );
  return native;
}

afterEach(()=>{
  delete (globalThis as unknown as {Capacitor?:unknown}).Capacitor;
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('update banner',()=>{
  it('downloads a newer APK inside the app',async()=>{
    const user=userEvent.setup();
    const native=phone('direct',{direct:{latestCode:1010,latestName:'0.1.10',url:'https://example.com/UnMute-1010.apk'}});
    expect(await screen.findByRole('heading',{name:'Вышла версия 0.1.10'})).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Обновить'}));
    expect(native.downloadUpdate).toHaveBeenCalledWith({url:'https://example.com/UnMute-1010.apk',expectedVersionCode:1010});
  });

  it('opens the store page for a store build',async()=>{
    const user=userEvent.setup();
    const native=phone('store',{store:{latestCode:1010,url:'https://play.google.com/store/apps/details?id=app.unmute.english'}});
    await user.click(await screen.findByRole('button',{name:'Открыть магазин'}));
    expect(native.openExternal).toHaveBeenCalled();
    expect(native.downloadUpdate).not.toHaveBeenCalled();
  });

  it('covers the app below the minimum version',async()=>{
    phone('direct',{direct:{latestCode:1010,minimumCode:1008,url:'https://example.com/UnMute-1010.apk'}});
    expect(await screen.findByRole('dialog',{name:'Нужно обновить приложение'})).toBeTruthy();
    await waitFor(()=>expect(screen.queryByRole('button',{name:'Позже'})).toBeNull());
  });
});
