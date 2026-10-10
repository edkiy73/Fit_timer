import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { ActionButton, AppDialog } from './components/primitives';

export function NativeNavigation(){
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
      }else if(document.querySelector('[role="dialog"]')){
        window.dispatchEvent(new Event('feture:dismiss-overlay'));
      }else if((window.history.state?.idx||0)>0)navigate(-1);
      else if(location.pathname!=='/')navigate('/',{replace:true});
      else setExitPrompt(true);
    });
    let handle:Awaited<typeof registration>|undefined;
    void registration.then(listener=>{if(removed)void listener.remove();else handle=listener;});
    return ()=>{removed=true;if(handle)void handle.remove();};
  },[]);
  return exitPrompt?<AppDialog title="Закрыть FetUre?" onClose={()=>setExitPrompt(false)}><p className="ft-muted">Твои сохранённые отметки останутся на устройстве.</p><div className="ft-dialog-actions"><ActionButton onClick={()=>setExitPrompt(false)}>Остаться</ActionButton><button type="button" className="ft-textbtn" onClick={()=>void App.exitApp()}>Закрыть приложение</button></div></AppDialog>:null;
}
