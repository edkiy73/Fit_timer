// The A1 test course must stay a valid, separately sold set with a one-day preview.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildA1StarterCourse, A1_STARTER_SKU } from '../lib/a1-starter-course.mjs';

const require=createRequire(import.meta.url);
const Content=require('../lib/content-store.js');
const product=require('../config/product.json');

const course=buildA1StarterCourse();
Content.validateSet(course);

assert.equal(course.access.mode,'entitlement');
assert.equal(course.access.entitlement,A1_STARTER_SKU);
assert.equal(course.access.freePreview.days,1);
assert.ok(product.products.some(item=>item.sku===A1_STARTER_SKU),'SKU is listed in config/product.json');

const ids=new Set(course.activities.map(activity=>activity.id));
assert.equal(ids.size,course.activities.length,'activity ids are unique');
const nodes=course.roadmaps[0].nodes;
assert.deepEqual(nodes.map(node=>node.dayIndex),[1,2,3]);
for(const node of nodes){
  for(const id of node.activityIds) assert.ok(ids.has(id),'node '+node.id+' references '+id);
  assert.ok(node.activityIds.some(id=>id.startsWith('plan.')),'every day has a plan note');
}
// Every graded card explains the answer in both languages.
for(const activity of course.activities){
  if(activity.type!=='choice' && activity.type!=='translation') continue;
  assert.ok(activity.explanation?.ru && activity.explanation?.en,activity.id+' has an explanation');
}
// Every phrase in a drill says why it is built that way.
for(const activity of course.activities){
  if(activity.type!=='pattern-drill') continue;
  for(const item of activity.items) assert.ok(item.explanation?.ru && item.explanation?.en,item.id+' has an explanation');
}
console.log('a1 starter course ok');
