import { useEffect, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { appDocs } from './sync';
import { patchSettings, readSettings } from './settings';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings
} from './settings-data';

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
    const stop=appDocs.subscribe(change=>{
      if(change.keys.some(ref=>ref.key==='settings'))void load();
    });
    return ()=>{live=false;stop();};
  },[]);

  const save=async(patch:Partial<Omit<NotificationSettings,'changedAt'>>)=>{
    const next=nextSettings(settings,patch);
    setSettings(next);
    setSaving(true);
    try{
      await patchSettings({notifications:next});
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

      <label className="notification-toggle">
        <input
          type="checkbox"
          checked={settings.enabled}
          disabled={saving}
          onChange={event=>void save({enabled:event.target.checked})}
        />
        <span>
          <strong>{t('notifications.enabled')}</strong>
          <small>{t('notifications.enabledHint')}</small>
        </span>
      </label>

      <label className="notification-time">
        <span>{t('notifications.time')}</span>
        <input
          type="time"
          value={settings.time}
          disabled={!settings.enabled||saving}
          onChange={event=>void save({time:event.target.value})}
        />
      </label>

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
