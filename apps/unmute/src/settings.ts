import { appDocs, SETTINGS_DOC } from './sync';
import {
  parseSettings,
  type UnMuteSettings
} from './settings-data';

export type { UnMuteSettings } from './settings-data';
export { mergeSettings, parseSettings } from './settings-data';

export async function readSettings():Promise<UnMuteSettings>{
  return parseSettings(await appDocs.read(SETTINGS_DOC));
}

let writeChain=Promise.resolve();

export function patchSettings(patch:Partial<UnMuteSettings>):Promise<void>{
  const job=writeChain.then(async()=>{
    const current=await readSettings();
    const next={...current,...patch};
    await appDocs.write(SETTINGS_DOC,JSON.stringify(next));
  });
  writeChain=job.catch(()=>{});
  return job;
}
