import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { useLocation, useNavigate } from 'react-router';
import { Capacitor } from '@capacitor/core';

/* Android system Back. Without a listener Capacitor closes the app from any screen.
   Now Back walks the app like a user expects:
   an open sheet closes (it owns a history entry, see sheet.tsx) → a lesson or inner
   screen goes back → another tab goes to «Сегодня» → on «Сегодня» the first Back only says
   «Нажми ещё раз, чтобы выйти», a second one within two seconds leaves the app. */

export type BackAction = 'history' | 'today' | 'minimize';

const TABS = new Set(['/course', '/review', '/account']);

export function backAction(pathname: string, historyState: unknown, canGoBack: boolean): BackAction {
  const sheetOpen = Boolean(historyState && typeof historyState === 'object' && 'unmuteSheet' in historyState);
  if(sheetOpen) return 'history';
  if(pathname === '/' || pathname === '') return 'minimize';
  if(TABS.has(pathname)) return 'today';
  return canGoBack ? 'history' : 'today';
}

/** Leaving takes two presses: true when this press follows the previous one closely enough. */
export const EXIT_WINDOW_MS = 2000;
export function secondExitPress(now: number, lastPress: number | null): boolean {
  return lastPress !== null && now - lastPress <= EXIT_WINDOW_MS;
}

export function NativeBackButton(){
  const {t} = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const path = useRef(location.pathname);
  path.current = location.pathname;
  const lastExitPress = useRef<number | null>(null);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if(!hint) return;
    const timer = window.setTimeout(() => setHint(false), EXIT_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [hint]);

  useEffect(() => {
    if(!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | null = null;
    let cancelled = false;
    void import('@capacitor/app').then(({App}) => App.addListener('backButton', ({canGoBack}) => {
      const action = backAction(path.current, window.history.state, canGoBack);
      if(action === 'history') window.history.back();
      else if(action === 'today') navigate('/', {replace:true});
      else if(secondExitPress(Date.now(), lastExitPress.current)){
        lastExitPress.current = null;
        setHint(false);
        void App.minimizeApp();
      }else{
        lastExitPress.current = Date.now();
        setHint(true);
      }
    })).then(handle => {
      if(cancelled) void handle.remove();
      else remove = () => void handle.remove();
    }).catch(() => undefined);
    return () => { cancelled = true; remove?.(); };
  }, [navigate]);

  return hint ? <div className="exit-hint" role="status">{t('nav.exitHint')}</div> : null;
}
