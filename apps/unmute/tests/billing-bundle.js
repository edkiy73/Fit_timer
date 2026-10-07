'use strict';
// «Курс + Plus на год» (launch plan, decision 2): with UnMute's own product config the
// bundle SKU grants the course forever and a year of Plus, and a refund takes both back.
process.env.ALLOW_MEMORY_STORE='1';
const assert=require('assert');
const crypto=require('crypto');
require('../lib/product');
const {applyBillingEvent}=require('../../../packages/core/server/billing');
const {checkSku}=require('../../../packages/core/server/entitlements');
const {store}=require('../../../packages/core/server/store');

(async()=>{
  const email='bundle-'+Date.now()+'@example.com';
  const accountOf=async()=>JSON.parse(await store.get('a:'+crypto.createHash('sha256').update(email).digest('hex').slice(0,32)));
  assert.equal(checkSku('bundle.course.general-foundation'),null,'the bundle of any course can be bought');
  const paid={orderId:'b-1',email,sku:'bundle.course.general-foundation',status:'paid'};
  const result=await applyBillingEvent('test',paid,new Date('2026-10-07T10:00:00Z'));
  assert.equal(result.ok,true);
  let acc=await accountOf();
  assert.ok(acc.owned['course.general-foundation'],'the course is owned');
  assert.equal(acc.sub.plan,'plus.year');
  assert.equal(acc.sub.until,'2027-10-07','a year of Plus');
  assert.equal(acc.owned['bundle.course.general-foundation'],undefined);
  await applyBillingEvent('test',{...paid,status:'refunded'});
  acc=await accountOf();
  assert.equal(acc.owned['course.general-foundation'],undefined);
  assert.equal(acc.sub,null);
  console.log('UnMute course + Plus bundle checks passed');
})().catch(error=>{console.error(error);process.exit(1);});
