// A product's config/product.json → aiDefaults sets the starting models; saved admin settings win.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.ALLOW_MEMORY_STORE = '1';
const require = createRequire(import.meta.url);
const { configureProduct } = require('../server/product-core');
const { store } = require('../server/store');
const { getSettings } = require('../server/ai');

configureProduct({id:'defaults-test', name:'Defaults test', slug:'defaults-test', features:{ai:true}});
let settings = await getSettings();
assert.equal(settings.text.primary.provider, 'gemini', 'Core default without product override');

configureProduct({id:'defaults-test', name:'Defaults test', slug:'defaults-test', features:{ai:true},
  aiDefaults:{text:{primary:{provider:'gemini', model:'gemini-new'}, backup:{provider:'openrouter', model:'vendor/model'}}}});
settings = await getSettings();
assert.deepEqual(settings.text.primary, {provider:'gemini', model:'gemini-new'});
assert.deepEqual(settings.text.backup, {provider:'openrouter', model:'vendor/model'});
assert.equal(settings.image.primary.provider, 'gemini', 'image route keeps Core defaults');

await store.set('settings:ai', JSON.stringify({text:{primary:{provider:'openai', model:'saved'}, backup:{provider:'gemini', model:'b'}}}));
settings = await getSettings();
assert.deepEqual(settings.text.primary, {provider:'openai', model:'saved'}, 'saved admin settings win');
console.log('ai product defaults ok');
