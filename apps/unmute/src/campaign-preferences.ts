import { appDocs } from './sync';
import {
  DEFAULT_CAMPAIGN_PREFERENCES,
  parseCampaignPreferences,
  type CampaignPreferences
} from './campaign-preferences-data';

export { DEFAULT_CAMPAIGN_PREFERENCES, type CampaignPreferences } from './campaign-preferences-data';

export const CAMPAIGN_PREFS_DOC='notificationPrefs';

export async function readCampaignPreferences():Promise<CampaignPreferences>{
  return parseCampaignPreferences(await appDocs.read(CAMPAIGN_PREFS_DOC));
}

export async function patchCampaignPreferences(
  patch:Partial<Omit<CampaignPreferences,'changedAt'>>
):Promise<CampaignPreferences>{
  const current=await readCampaignPreferences();
  const next={...current,...patch,changedAt:new Date().toISOString()};
  await appDocs.write(CAMPAIGN_PREFS_DOC,JSON.stringify(next));
  return next;
}
