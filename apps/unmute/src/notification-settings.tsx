import { trackReminderEnabled } from './observability';
import { useEffect, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { appDocs } from './sync';
import { patchSettings, readSettings } from './settings';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings
} from './settings-data';

import {
  nativeNotificationsAvailable,
  notificationPermissionState,
  requestNotificationPermission,
  type NotificationPermissionState
} from './notification-native';
import { syncRemotePush, unregisterRemotePush } from './remote-push';
import {
  DEFAULT_CAMPAIGN_PREFERENCES,
  patchCampaignPreferences,
  readCampaignPreferences,
  type CampaignPreferences
} from './campaign-preferences';

function nextSettings(
  current:NotificationSettings,
  patch:Partial<Omit<NotificationSettings,'changedAt'>>
):NotificationSettings{
  return {
    ...current,
    ...patch,
    changedAt:new Date().toISOString()
  };
}

export function NotificationSettingsPanel(){
  const {t}=useI18n();
  const [settings,setSettings]=useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [loaded,setLoaded]=useState(false);
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState(false);
  const [permission,setPermission]=useState<NotificationPermissionState>('unavailable');
  const [campaigns,setCampaigns]=useState<CampaignPreferences>(DEFAULT_CAMPAIGN_PREFERENCES);
  const [campaignSaving,setCampaignSaving]=useState(false);
  const native=nativeNotificationsAvailable();

  const refreshNativeState=async(request=false)=>{
    if(!native){
      setPermission('unavailable');
      return;
    }
    const next=request
      ? await requestNotificationPermission()
      : await notificationPermissionState();
    setPermission(next);
  };

  useEffect(()=>{
    let live=true;
    const load=async()=>{
      try{
        const [value,campaignValue]=await Promise.all([readSettings(),readCampaignPreferences()]);
        if(live){
          setSettings(value.notifications??DEFAULT_NOTIFICATION_SETTINGS);
          setCampaigns(campaignValue);
        }
      }finally{
        if(live)setLoaded(true);
      }
    };
    void load();
    void refreshNativeState();
    const stop=appDocs.subscribe(change=>{
      if(change.keys.some(ref=>ref.key==='settings'))void load();
    });
    return ()=>{live=false;stop();};
  },[]);

  const save=async(patch:Partial<Omit<NotificationSettings,'changedAt'>>):Promise<boolean>=>{
    const previous=settings;
    const next=nextSettings(settings,patch);
    setSettings(next);
    setSaving(true);
    setSaveError(false);
    try{
      await patchSettings({notifications:next});
      return true;
    }catch{
      setSettings(previous);
      setSaveError(true);
      return false;
    }finally{
      setSaving(false);
    }
  };

  const askSystemPermission=async()=>{
    setSaving(true);
    try{
      await refreshNativeState(true);
      await syncRemotePush(true);
    }finally{
      setSaving(false);
    }
  };

  const setKind=async(kind:'review'|'streak'|'daily',enabled:boolean)=>{
    const base=settings.enabled
      ? settings
      : {...settings,review:false,streak:false,daily:false};
    const nextKinds={...base,[kind]:enabled};
    const nextEnabled=Boolean(nextKinds.review||nextKinds.streak||nextKinds.daily);
    const saved=await save({
      enabled:nextEnabled,
      review:nextKinds.review,
      streak:nextKinds.streak,
      daily:nextKinds.daily
    });
    if(!saved)return;
    if(enabled)trackReminderEnabled();
    if(!nextEnabled){
      await unregisterRemotePush();
      return;
    }
    if(native){
      const nextPermission=permission==='granted' ? permission : await requestNotificationPermission();
      setPermission(nextPermission);
      if(nextPermission==='granted')await syncRemotePush(true);
    }
  };

  const setCampaignKind=async(kind:'news'|'offers'|'emailNews'|'emailOffers',enabled:boolean)=>{
    const previous=campaigns;
    const next={...campaigns,[kind]:enabled};
    setCampaigns(next);
    setCampaignSaving(true);
    setSaveError(false);
    try{
      const saved=await patchCampaignPreferences({[kind]:enabled});
      setCampaigns(saved);
      if((kind==='news'||kind==='offers')&&enabled&&native){
        const nextPermission=permission==='granted' ? permission : await requestNotificationPermission();
        setPermission(nextPermission);
        if(nextPermission==='granted')await syncRemotePush(true);
      }
    }catch{
      setCampaigns(previous);
      setSaveError(true);
    }finally{
      setCampaignSaving(false);
    }
  };

  if(!loaded)return null;

  return (
    <section className="notification-settings notification-settings-compact" aria-labelledby="notification-settings-title">
      <div>
        <div className="eyebrow">{t('notifications.eyebrow')}</div>
        <h3 id="notification-settings-title">{t('notifications.title')}</h3>
        <p>{t('notifications.deliveryNote')}</p>
      </div>

      {saveError&&<p className="access-error" role="alert">{t('notifications.saveError')}</p>}

      <div className="notification-kinds notification-kind-cards">
        {(['review','streak','daily'] as const).map(kind=>(
          <label key={kind} className="notification-kind-toggle">
            <span>{t('notifications.'+kind)}</span>
            <input
              type="checkbox"
              checked={settings.enabled&&settings[kind]}
              disabled={saving}
              onChange={event=>void setKind(kind,event.target.checked)}
            />
          </label>
        ))}
      </div>

      <div className="notification-group">
        <div className="settings-label">{t('notifications.campaignsTitle')}</div>
        <p className="notification-group-hint">{t('notifications.campaignsHint')}</p>
        <div className="notification-kinds notification-kind-cards">
          {(['news','offers','emailNews','emailOffers'] as const).map(kind=>(
            <label key={kind} className="notification-kind-toggle">
              <span>{t('notifications.'+kind)}</span>
              <input
                type="checkbox"
                checked={campaigns[kind]}
                disabled={campaignSaving}
                onChange={event=>void setCampaignKind(kind,event.target.checked)}
              />
            </label>
          ))}
        </div>
      </div>

      {settings.enabled&&native&&permission!=='granted'&&(
        <div className="notification-status notification-status-warning" role="status">
          <span>{permission==='denied'?t('notifications.permissionDeniedText'):t('notifications.permissionNeededText')}</span>
          <button className="secondary-button" type="button" disabled={saving} onClick={()=>void askSystemPermission()}>
            {t('notifications.allowSystem')}
          </button>
        </div>
      )}

      {settings.enabled&&!native&&(
        <p className="notification-priority">{t('notifications.webStatusText')}</p>
      )}
    </section>
  );}
