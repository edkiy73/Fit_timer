'use strict';

const { store } = require('../../../packages/core/server/store');
const { send } = require('../../../packages/core/server/util');

function taskStatsFromDocuments(raws){
  let accounts = 0;
  let total = 0;
  let active = 0;
  let done = 0;
  let tombstones = 0;

  for(const raw of raws){
    if(!raw) continue;
    let parsed = null;
    try{ parsed = JSON.parse(raw); }catch(_){}
    const items = parsed && parsed.items && typeof parsed.items === 'object' ? parsed.items : null;
    if(!items) continue;
    accounts++;
    for(const value of Object.values(items)){
      if(!value || typeof value !== 'object') continue;
      if(value.deleted === true){ tombstones++; continue; }
      total++;
      if(value.done === true) done++;
      else active++;
    }
  }

  return {accounts,total,active,done,tombstones};
}

async function taskStats(){
  const keys = await store.scan('sa:*:tasks', 5000);
  const raws = await store.many(keys);
  return taskStatsFromDocuments(raws);
}

async function handleTaskAdmin(action, _body, res){
  if(action !== 'task_stats') return false;
  send(res, 200, {ok:true, stats:await taskStats()});
  return true;
}

module.exports = { taskStatsFromDocuments, taskStats, handleTaskAdmin };
