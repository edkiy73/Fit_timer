// Terms of use typed in Admin: kept as multi-line Markdown, served only on ?terms=1.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.ALLOW_MEMORY_STORE = '1';
const require = createRequire(import.meta.url);
require('../template/lib/product');
const { store } = require('../server/store');
const { sanitizeSettings } = require('../server/ai');
const { createAIHandler } = require('../server/ai-endpoint');

const clean = sanitizeSettings({legal:{owner:'ИП Тест', terms:'# Условия\r\n\r\n- пункт\u0007 один\n'}});
assert.equal(clean.legal.terms, '# Условия\n\n- пункт один', 'line breaks stay, control characters go');
assert.equal(sanitizeSettings({}).legal.terms, '', 'empty by default: the app shows its own text');
assert.equal(sanitizeSettings({legal:{terms:'x'.repeat(50000)}}).legal.terms.length, 40000);

await store.set('settings:ai', JSON.stringify(clean));
const handler = createAIHandler({get:() => null});
async function get(query){
  const res = {statusCode:0, headers:{}, body:'', setHeader(k, v){ this.headers[k] = v; }, end(b){ this.body = b || ''; }};
  await handler({method:'GET', headers:{}, query}, res);
  return JSON.parse(res.body);
}
const config = await get({public_config:'1'});
assert.equal(config.legal.owner, 'ИП Тест');
assert.equal(config.legal.terms, undefined, 'the long text is not sent on every app start');
const terms = await get({public_config:'1', terms:'1'});
assert.equal(terms.terms, '# Условия\n\n- пункт один');
assert.equal(terms.legal.owner, 'ИП Тест');
console.log('Legal terms OK');
