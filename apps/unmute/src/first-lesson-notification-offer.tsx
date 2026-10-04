import { useEffect, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { Sheet } from './sheet';
import { patchSettings, readSettings } from './settings';
import { DEFAULT_NOTIFICATION_SETTINGS } from './settings-data';
import {
  nativeNotificationsAvailable,
  requestNotificationPermission
} from './notification-native';
import { syncRemotePush } from './remote-push';

export function FirstLessonNotificationOffer({
  eligible
}:{eligible:boolean}){
  const {t}=useI18n();
  const [open,setOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState(false);

  useEffect(()=>{
    let live=true;
    if(!eligible||!nativeNotificationsAvailable())return;
    void readSettings().then(settings=>{
      if(!live)return;
      if(settings.notificationOfferDoneAt)return;
      if(settings.notifications?.enabled)return;
      setOpen(true);
    }).catch(()=>{});
    return ()=>{live=false;};
  },[eligible]);

  const markDone=async()=>{
    await patchSettings({notificationOfferDoneAt:new Date().toISOString()});
  };

  const dismiss=async()=>{
    setOpen(false);
    try{await markDone();}catch{}
  };

  const enable=async()=>{
    setSaving(true);
    setError(false);
    try{
      const current=await readSettings();
      const existing=current.notifications??DEFAULT_NOTIFICATION_SETTINGS;
      const now=new Date().toISOString();
      await patchSettings({
        notificationOfferDoneAt:now,
        notifications:{
          ...existing,
          enabled:true,
          time:'19:00',
          changedAt:now
        }
      });
      // Permission is requested only after the explicit opt-in action above.
      await requestNotificationPermission();
      await syncRemotePush(true);
      setOpen(false);
    }catch{
      setError(true);
    }finally{
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={()=>void dismiss()}
      labelledBy="first-notification-offer-title"
      closeLabel={t('notifications.offerClose')}
    >
      <div className="notification-offer">
        <div className="screen-kicker">{t('notifications.offerKicker')}</div>
        <h3 id="first-notification-offer-title">{t('notifications.offerTitle')}</h3>
        <p>{t('notifications.offerText')}</p>
        {error&&<p className="access-error" role="alert">{t('notifications.offerError')}</p>}
        <button className="primary-button" type="button" disabled={saving} onClick={()=>void enable()}>
          {t('notifications.offerAccept')}
        </button>
        <button className="secondary-button" type="button" disabled={saving} onClick={()=>void dismiss()}>
          {t('notifications.offerLater')}
        </button>
      </div>
    </Sheet>
  );
}
