import { useEffect, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { appDocs } from './sync';
import { patchSettings, readSettings } from './settings';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings
} from './settings-data';

import {
  exactNotificationTimeAvailable,
  nativeNotificationsAvailable,
  notificationPermissionState,
  requestExactNotificationTime,
  requestNotificationPermission,
  type NotificationPermissionState
} from './notification-native';

// 24-hour picker on every phone: the native time input follows the system 12/24 h setting.
const pad=(value:number)=>String(value).padStart(2,'0');
const HOURS=Array.from({length:24},(_,hour)=>pad(hour));
const MINUTES=Array.from({length:12},(_,step)=>pad(step*5));
const minuteOptions=(current:string)=>MINUTES.includes(current)?MINUTES:[...MINUTES,current].sort();

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
  const [exact,setExact]=useState<boolean|null>(null);
  const native=nativeNotificationsAvailable();

  const refreshNativeState=async(request=false)=>{
    if(!native){
      setPermission('unavailable');
      setExact(null);
      return;
    }
    const next=request
      ? await requestNotificationPermission()
      : await notificationPermissionState();
    setPermission(next);
    setExact(next==='granted'?await exactNotificationTimeAvailable():null);
  };

  useEffect(()=>{
    let live=true;
    const load=async()=>{
      try{
        const value=await readSettings();
        if(live)setSettings(value.notifications??DEFAULT_NOTIFICATION_SETTINGS);
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

  const setEnabled=async(enabled:boolean)=>{
    const saved=await save({enabled});
    if(saved&&enabled&&native)await refreshNativeState(true);
  };

  const askSystemPermission=async()=>{
    setSaving(true);
    try{
      await refreshNativeState(true);
    }finally{
      setSaving(false);
    }
  };

  const askExactTime=async()=>{
    setSaving(true);
    try{
      setExact(await requestExactNotificationTime());
    }finally{
      setSaving(false);
    }
  };

  if(!loaded)return null;

  return (
    <section className="notification-settings" aria-labelledby="notification-settings-title">
      <div>
        <div className="eyebrow">{t('notifications.eyebrow')}</div>
        <h3 id="notification-settings-title">{t('notifications.title')}</h3>
        <p>{t('notifications.deliveryNote')}</p>
      </div>

      {saveError&&<p className="access-error" role="alert">{t('notifications.saveError')}</p>}

      <label className="notification-toggle">
        <input
          type="checkbox"
          checked={settings.enabled}
          disabled={saving}
          onChange={event=>void setEnabled(event.target.checked)}
        />
        <span>
          <strong>{t('notifications.enabled')}</strong>
          <small>{t('notifications.enabledHint')}</small>
        </span>
      </label>

      {settings.enabled&&!native&&(
        <div className="notification-status" role="note">
          <strong>{t('notifications.webStatusTitle')}</strong>
          <span>{t('notifications.webStatusText')}</span>
        </div>
      )}

      {settings.enabled&&native&&permission==='granted'&&(
        <div className="notification-status notification-status-ok" role="status">
          <strong>{t('notifications.nativeReadyTitle')}</strong>
          <span>
            {exact===false
              ? t('notifications.nativeApproximate')
              : t('notifications.nativeReadyText')}
          </span>
          {exact===false&&(
            <button
              className="secondary-button"
              type="button"
              disabled={saving}
              onClick={()=>void askExactTime()}
            >
              {t('notifications.allowExact')}
            </button>
          )}
        </div>
      )}

      {settings.enabled&&native&&permission!=='granted'&&(
        <div className="notification-status notification-status-warning" role="status">
          <strong>
            {permission==='denied'
              ? t('notifications.permissionDeniedTitle')
              : t('notifications.permissionNeededTitle')}
          </strong>
          <span>
            {permission==='denied'
              ? t('notifications.permissionDeniedText')
              : t('notifications.permissionNeededText')}
          </span>
          <button
            className="secondary-button"
            type="button"
            disabled={saving}
            onClick={()=>void askSystemPermission()}
          >
            {t('notifications.allowSystem')}
          </button>
        </div>
      )}

      <div className="notification-time" role="group" aria-label={t('notifications.time')}>
        <span>{t('notifications.time')}</span>
        <span className="notification-time-fields">
          <select
            aria-label={t('notifications.hours')}
            value={settings.time.slice(0,2)}
            disabled={!settings.enabled||saving}
            onChange={event=>void save({time:event.target.value+settings.time.slice(2)})}
          >
            {HOURS.map(hour=><option key={hour} value={hour}>{hour}</option>)}
          </select>
          <span aria-hidden="true">:</span>
          <select
            aria-label={t('notifications.minutes')}
            value={settings.time.slice(3,5)}
            disabled={!settings.enabled||saving}
            onChange={event=>void save({time:settings.time.slice(0,3)+event.target.value})}
          >
            {minuteOptions(settings.time.slice(3,5)).map(minute=><option key={minute} value={minute}>{minute}</option>)}
          </select>
        </span>
      </div>

      <div className="notification-kinds">
        <label>
          <input
            type="checkbox"
            checked={settings.review}
            disabled={!settings.enabled||saving}
            onChange={event=>void save({review:event.target.checked})}
          />
          <span>{t('notifications.review')}</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.streak}
            disabled={!settings.enabled||saving}
            onChange={event=>void save({streak:event.target.checked})}
          />
          <span>{t('notifications.streak')}</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.daily}
            disabled={!settings.enabled||saving}
            onChange={event=>void save({daily:event.target.checked})}
          />
          <span>{t('notifications.daily')}</span>
        </label>
      </div>

      <p className="notification-priority">{t('notifications.priority')}</p>
    </section>
  );
}
