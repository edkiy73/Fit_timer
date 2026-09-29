export interface NotificationSettings {
  enabled:boolean;
  time:string;
  daily:boolean;
  review:boolean;
  streak:boolean;
  changedAt:string;
}

export interface UnMuteSettings {
  locale?:string;
  onboardingDoneAt?:string;
  notifications?:NotificationSettings;
}

export const DEFAULT_NOTIFICATION_SETTINGS:NotificationSettings={
  enabled:false,
  time:'19:00',
  daily:true,
  review:true,
  streak:true,
  changedAt:''
};

function validTime(value:unknown):value is string{
  return typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function parseNotificationSettings(value:unknown):NotificationSettings|undefined{
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
  const source=value as Record<string,unknown>;
  if(
    typeof source.enabled!=='boolean'||
    typeof source.daily!=='boolean'||
    typeof source.review!=='boolean'||
    typeof source.streak!=='boolean'||
    !validTime(source.time)||
    typeof source.changedAt!=='string'||
    !Number.isFinite(Date.parse(source.changedAt))
  ) return undefined;
  return {
    enabled:source.enabled,
    time:source.time,
    daily:source.daily,
    review:source.review,
    streak:source.streak,
    changedAt:source.changedAt
  };
}

export function parseSettings(raw:string|null):UnMuteSettings{
  if(!raw)return {};
  try{
    const value=JSON.parse(raw) as unknown;
    if(!value||typeof value!=='object'||Array.isArray(value))return {};
    const source=value as Record<string,unknown>;
    const result:UnMuteSettings={};
    if(typeof source.locale==='string'&&source.locale.trim())result.locale=source.locale;
    if(typeof source.onboardingDoneAt==='string'&&source.onboardingDoneAt.trim()){
      result.onboardingDoneAt=source.onboardingDoneAt;
    }
    const notifications=parseNotificationSettings(source.notifications);
    if(notifications)result.notifications=notifications;
    return result;
  }catch{
    return {};
  }
}

function latestNotifications(
  local:NotificationSettings|undefined,
  remote:NotificationSettings|undefined
):NotificationSettings|undefined{
  if(!local)return remote;
  if(!remote)return local;
  const localAt=Date.parse(local.changedAt)||0;
  const remoteAt=Date.parse(remote.changedAt)||0;
  return localAt>=remoteAt?local:remote;
}

export function mergeSettings(
  local:UnMuteSettings,
  remote:UnMuteSettings
):UnMuteSettings{
  const result:UnMuteSettings={...remote,...local};
  const onboardingDoneAt=local.onboardingDoneAt||remote.onboardingDoneAt;
  if(onboardingDoneAt)result.onboardingDoneAt=onboardingDoneAt;

  const notifications=latestNotifications(local.notifications,remote.notifications);
  if(notifications)result.notifications=notifications;
  else delete result.notifications;

  return result;
}

export function mergeSettingsRaw(local:string|null,remote:string|null):string{
  return JSON.stringify(mergeSettings(parseSettings(local),parseSettings(remote)));
}
