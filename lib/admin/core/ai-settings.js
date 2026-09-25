'use strict';

const { store } = require('../../store');
const { send, fail } = require('../../util');
const { getSettings, sanitizeSettings, generate } = require('../../ai');

const ACTIONS = new Set(['save_settings','test_ai']);

async function handleAdminAISettings(action, body, res){
  if(!ACTIONS.has(action)) return false;

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
