export interface CampaignPreferences {
  news:boolean;
  offers:boolean;
  emailNews:boolean;
  emailOffers:boolean;
  changedAt:string;
}

export const DEFAULT_CAMPAIGN_PREFERENCES:CampaignPreferences={
  news:true,
  offers:true,
  emailNews:false,
  emailOffers:false,
  changedAt:''
};

export function parseCampaignPreferences(raw:string|null):CampaignPreferences{
  if(!raw)return {...DEFAULT_CAMPAIGN_PREFERENCES};
  try{
    const value=JSON.parse(raw) as Record<string,unknown>;
    return {
      news:value.news!==false,
      offers:value.offers!==false,
      emailNews:value.emailNews===true,
      emailOffers:value.emailOffers===true,
      changedAt:typeof value.changedAt==='string'?value.changedAt:''
    };
  }catch{
    return {...DEFAULT_CAMPAIGN_PREFERENCES};
  }
}

export function mergeCampaignPreferencesRaw(local:string|null,remote:string|null):string{
  const a=parseCampaignPreferences(local);
  const b=parseCampaignPreferences(remote);
  const at=Date.parse(a.changedAt)||0;
  const bt=Date.parse(b.changedAt)||0;
  return JSON.stringify(at>=bt?a:b);
}
