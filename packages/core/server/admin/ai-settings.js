'use strict';

const { store } = require('../store');
const { send, fail } = require('../util');
const { getSettings, sanitizeSettings, generate } = require('../ai');
const { loadSecrets, secretsStatus, setSecret } = require('../secrets');

const ACTIONS = new Set(['settings_get','save_settings','test_ai','secrets_status','secret_set']);

async function handleAdminAISettings(action, body, res){
  if(!ACTIONS.has(action)) return false;

  // Service keys are write-only: status says whether each is set, never its value.
  if(action === 'secrets_status'){
    await loadSecrets(true);
    send(res,200,{ok:true,secrets:secretsStatus()});
    return true;
  }
  if(action === 'secret_set'){
    try{
      await setSecret(String(body && body.name || ''), body && body.value);
    }catch(e){
      fail(res,e.status || 500,String(e.message || 'secret_failed'));
      return true;
    }
    send(res,200,{ok:true,secrets:secretsStatus()});
    return true;
  }

  // The whole settings object: save_settings replaces it, so an editor reads it first.
  if(action === 'settings_get'){
    send(res,200,{ok:true,settings:await getSettings()});
    return true;
  }

  if(action === 'save_settings'){
    const settings = sanitizeSettings(body && body.settings);
    await store.set('settings:ai', JSON.stringify(settings));
    send(res,200,{ok:true,settings});
    return true;
  }

  const type = body && body.type === 'image' ? 'image' : 'text';
  const settings = body && body.settings ? sanitizeSettings(body.settings) : await getSettings();
  try{
    const out = await generate(
      type,
      settings,
      type === 'image'
        ? 'Minimal flat app icon on dark background, no text'
        : 'Ответь ровно одним словом: работает'
    );
    send(res,200,{
      ok:true,
      provider:out.provider,
      model:out.model,
      fallback:out.fallback,
      result:type === 'text' ? out.text.slice(0,100) : 'image'
    });
  }catch(e){
    fail(res,502,'ai_test_failed',{detail:String(e.message || e).slice(0,500)});
  }
  return true;
}

module.exports={handleAdminAISettings,ACTIONS};
