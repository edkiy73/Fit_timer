export interface UnMuteSettings {
  locale?:string;
  onboardingDoneAt?:string;
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
    return result;
  }catch{
    return {};
  }
}

export function mergeSettings(
  local:UnMuteSettings,
  remote:UnMuteSettings
):UnMuteSettings{
  return {
    ...remote,
    ...local,
    onboardingDoneAt:local.onboardingDoneAt||remote.onboardingDoneAt
  };
}

export function mergeSettingsRaw(local:string|null,remote:string|null):string{
  return JSON.stringify(mergeSettings(parseSettings(local),parseSettings(remote)));
}
