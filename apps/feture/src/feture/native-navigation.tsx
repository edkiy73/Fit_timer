import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { ActionButton, AppDialog } from './components/primitives';
import { tabsBack, tabsReady } from '../fe/tabs';

export function NativeNavigation(){
  const { t } = useI18n();
  const location=useLocation();
  const navigate=useNavigate();
  const [exitPrompt,setExitPrompt]=useState(false);
  const current=useRef({location,navigate,exitPrompt});
  current.current={location,navigate,exitPrompt};
  useEffect(()=>{
    if(!Capacitor.isNativePlatform())return;
    let removed=false;
    const registration=App.addListener('backButton',()=>{
      const {location,navigate,exitPrompt}=current.current;
      if(exitPrompt){setExitPrompt(false);return;}
      const query=new URLSearchParams(location.search);
      const overlay=query.has('hint')?'hint':query.has('interest')?'interest':null;
      if(overlay){
        if(location.state?.overlayKey===overlay)navigate(-1);
        else{query.delete(overlay);navigate({pathname:location.pathname,search:query.toString()},{replace:true});}
      }else if(document.querySelector('[role="dialog"],[role="alertdialog"]')){
        // Earlier screens close on this event; kit sheets and dialogs (src/fe/kit) close on Escape.
        window.dispatchEvent(new Event('feture:dismiss-overlay'));
        document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      }else if(tabsReady()){
        // The app's own stacks of screens, one per dock tab (src/fe/tabs.ts): a screen steps back inside its tab, a tab's
        // root goes to the feed, the feed's root asks before closing.
        if(!tabsBack(navigate,undefined,location.pathname))setExitPrompt(true);
      }else if((window.history.state?.idx||0)>0)navigate(-1);
      // Any other screen goes to the feed, the feed asks before closing.
      else if(location.pathname!=='/n/feed')navigate('/n/feed',{replace:true});
      else setExitPrompt(true);
    });
    let handle:Awaited<typeof registration>|undefined;
    void registration.then(listener=>{if(removed)void listener.remove();else handle=listener;});
    return ()=>{removed=true;if(handle)void handle.remove();};
  },[]);
  return exitPrompt?<AppDialog title={t('fe.exit.title')} closeLabel={t('fe.close')} onClose={()=>setExitPrompt(false)}><p className="ft-muted">{t('fe.exit.text')}</p><div className="ft-dialog-actions"><ActionButton onClick={()=>setExitPrompt(false)}>{t('fe.exit.stay')}</ActionButton><button type="button" className="ft-textbtn" onClick={()=>void App.exitApp()}>{t('fe.exit.close')}</button></div></AppDialog>:null;
}
