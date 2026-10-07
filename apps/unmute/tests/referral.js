'use strict';

process.env.ALLOW_MEMORY_STORE='1';
const assert=require('assert');
const {store}=require('../../../packages/core/server/store');
const Referral=require('../lib/unmute-referral');

const now=new Date();
const iso=ms=>new Date(ms).toISOString();
async function account(hash,extra={}){
  const acc={email:hash+'@example.com',since:iso(Date.now()-86400000),seen:iso(Date.now()),sub:null,...extra};
  await store.set('a:'+hash,JSON.stringify(acc));
  return acc;
}
const read=async hash=>JSON.parse(await store.get('a:'+hash));
const rejects=async(promise,message)=>{ await assert.rejects(promise,error=>error.message===message); };

(async()=>{
  const stamp=Date.now();
  const inviter='ref-inviter-'+stamp, friend='ref-friend-'+stamp, old='ref-old-'+stamp;
  const inviterAcc=await account(inviter,{since:iso(Date.now()-400*86400000)});
  // The inviter already has Plus with renewal: the bonus extends it and keeps the renewal.
  const paidUntil=iso(Date.now()+10*86400000).slice(0,10);
  inviterAcc.sub={plan:'plus.month',since:iso(Date.now()).slice(0,10),until:paidUntil,autoRenew:true,provider:'instant',orderId:'o1'};
  await store.set('a:'+inviter,JSON.stringify(inviterAcc));
  const friendAcc=await account(friend);
  const oldAcc=await account(old,{since:iso(Date.now()-60*86400000)});

  assert.deepEqual(await Referral.getReferralSettings(),{bonusDays:7});
  assert.deepEqual(await Referral.saveReferralSettings({bonusDays:'10'}),{bonusDays:10});

  const info=await Referral.referralInfo(inviter,inviterAcc);
  assert.match(info.code,/^[A-Z2-9]{8}$/);
  assert.equal((await Referral.referralInfo(inviter,inviterAcc)).code,info.code,'the code is stable');
  assert.equal(info.bonusDays,10);
  assert.equal(info.canJoin,false,'an old account cannot join by a code');

  await rejects(Referral.claimReferral(inviter,inviterAcc,info.code),'own_code');
  await rejects(Referral.claimReferral(friend,friendAcc,'NOPE'),'bad_code');
  await rejects(Referral.claimReferral(friend,friendAcc,'ABCDEFGH'),'code_not_found');
  await rejects(Referral.claimReferral(old,oldAcc,info.code),'account_not_new');

  await Referral.claimReferral(friend,friendAcc,info.code.toLowerCase());
  await rejects(Referral.claimReferral(friend,friendAcc,info.code),'already_invited');
  // The friend cannot invite the inviter back.
  const friendCode=(await Referral.referralInfo(friend,friendAcc)).code;
  const freshInviter={...inviterAcc,since:iso(Date.now())};
  await rejects(Referral.claimReferral(inviter,freshInviter,friendCode),'mutual_invite');

  assert.deepEqual(await Referral.referralProgress(friend,2),{rewarded:false});
  assert.equal((await read(friend)).sub,null);
  const rewarded=await Referral.referralProgress(friend,3);
  assert.deepEqual(rewarded,{rewarded:true,bonusDays:10});
  assert.equal((await Referral.referralProgress(friend,4)).rewarded,false,'the bonus is given once');

  const friendSub=(await read(friend)).sub;
  assert.equal(friendSub.provider,'referral');
  assert.equal(friendSub.until,iso(now.getTime()+10*86400000).slice(0,10));
  const inviterSub=(await read(inviter)).sub;
  assert.equal(inviterSub.autoRenew,true);
  assert.equal(inviterSub.orderId,'o1');
  assert.equal(inviterSub.until,iso(Date.parse(paidUntil)+10*86400000).slice(0,10));

  const after=await Referral.referralInfo(inviter,inviterAcc);
  assert.equal(after.invited,1);
  assert.equal(after.rewarded,1);
  assert.deepEqual((await Referral.referralInfo(friend,friendAcc)).referred,{rewarded:true});
  assert.deepEqual(await Referral.referralTotals(),{invited:1,rewarded:1});

  await Referral.purgeReferral(inviter);
  await rejects(Referral.claimReferral(old,{...oldAcc,since:iso(Date.now())},info.code),'code_not_found');

  console.log('referral: ok');
})().catch(error=>{ console.error(error); process.exit(1); });
