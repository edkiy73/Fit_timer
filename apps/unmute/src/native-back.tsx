import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Capacitor } from '@capacitor/core';

/* Android system Back. Without a listener Capacitor closes the app from any screen.
   Now Back walks the app like a user expects:
   an open sheet closes (it owns a history entry, see sheet.tsx) → a lesson or inner
   screen goes back → another tab goes to «Сегодня» → only «Сегодня» minimizes the app. */

export type BackAction = 'history' | 'today' | 'minimize';

const TABS = new Set(['/course', '/review', '/account']);

export function backAction(pathname: string, historyState: unknown, canGoBack: boolean): BackAction {
  const sheetOpen = Boolean(historyState && typeof historyState === 'object' && 'unmuteSheet' in historyState);
  if(sheetOpen) return 'history';
  if(pathname === '/' || pathname === '') return 'minimize';
  if(TABS.has(pathname)) return 'today';
  return canGoBack ? 'history' : 'today';
}

export function NativeBackButton(){
  const navigate = useNavigate();
  const location = useLocation();
  const path = useRef(location.pathname);
  path.current = location.pathname;

  useEffect(() => {
    if(!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | null = null;
    let cancelled = false;
    void import('@capacitor/app').then(({App}) => App.addListener('backButton', ({canGoBack}) => {
      const action = backAction(path.current, window.history.state, canGoBack);
      if(action === 'history') window.history.back();
      else if(action === 'today') navigate('/', {replace:true});
      else void App.minimizeApp();
    })).then(handle => {
      if(cancelled) void handle.remove();
      else remove = () => void handle.remove();
    }).catch(() => undefined);
    return () => { cancelled = true; remove?.(); };
  }, [navigate]);

  return null;
}
