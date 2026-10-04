import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useOptionalAuth } from '@appbase/ui-react/auth.js';
import { appDocs } from './sync';
import { readSettings } from './settings';
import {
  startRemotePush,
  stopRemotePush,
  subscribeRemotePushRoute,
  syncRemotePush,
  unregisterRemotePush
} from './remote-push';

export function RemotePushLifecycle(){
  const auth=useOptionalAuth();
  const navigate=useNavigate();
  const email=auth.session?.email??'';

  useEffect(()=>{
    startRemotePush();
    return ()=>stopRemotePush();
  },[]);

  useEffect(()=>{
    return subscribeRemotePushRoute(route=>navigate(route));
  },[navigate]);

  useEffect(()=>{
    let live=true;
    const reconcile=async()=>{
      if(!email)return;
      try{
        const settings=await readSettings();
        if(!live)return;
        if(settings.notifications?.enabled)await syncRemotePush(false);
        else await unregisterRemotePush();
      }catch{}
    };
    void reconcile();
    const stop=appDocs.subscribe(change=>{
      if(change.keys.some(ref=>ref.key==='settings'))void reconcile();
    });
    return ()=>{live=false;stop();};
  },[email]);

  return null;
}
