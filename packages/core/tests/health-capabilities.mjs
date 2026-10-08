import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.APPBASE_HOST_ADAPTER='health-test-host';
const require=createRequire(import.meta.url);
const {configureProduct}=require('../server/product-core');
const {collectHealth}=require('../server/health');

configureProduct({
  id:'test.disabled',
  name:'Disabled capabilities',
  slug:'disabled',
  features:{ai:false,notifications:false,premium:false},
  products:[]
});
const disabled=await collectHealth();
assert.equal(disabled.services.ai.enabled,false);
assert.equal(disabled.services.push.enabled,false);
assert.equal(disabled.services.billing.enabled,false);
assert.equal(disabled.warnings.some(x=>x.includes('ИИ включён')),false);
assert.equal(disabled.warnings.some(x=>x.includes('Уведомления включены')),false);
assert.equal(disabled.warnings.some(x=>x.includes('Платные функции включены')),false);

configureProduct({
  id:'test.enabled',
  name:'Enabled capabilities',
  slug:'enabled',
  features:{ai:true,notifications:true,premium:true},
  products:[{sku:'premium.month',title:'Premium'}]
});
const enabled=await collectHealth();
assert.equal(enabled.services.ai.enabled,true);
assert.equal(enabled.services.push.enabled,true);
assert.equal(enabled.services.billing.enabled,true);
assert.equal(enabled.infrastructure.hosting.adapter,'health-test-host');
assert.equal(enabled.infrastructure.hosting.runtime,'node');

console.log('ok  health distinguishes product capabilities and exposes provider-neutral hosting readiness');
