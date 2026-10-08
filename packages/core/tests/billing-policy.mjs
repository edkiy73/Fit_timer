/* Canonical billing policy: one source for Router + shared Admin. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { billingProviderPolicy, billingPolicySupports, billingPolicyList } = require('../server/billing-policy');

let bad = 0;
const ok = (name, cond) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name);
};

ok('App Store is limited to iOS App Store distribution',
  billingPolicySupports('apple', {platform:'ios', distribution:'app_store', country:'US'})
  && !billingPolicySupports('apple', {platform:'web', distribution:'web', country:'US'})
  && !billingPolicySupports('apple', {platform:'ios', distribution:'direct', country:'US'}));

ok('Google Play is limited to Android Play distribution',
  billingPolicySupports('google_play', {platform:'android', distribution:'google_play', country:'DE'})
  && !billingPolicySupports('google_play', {platform:'ios', distribution:'app_store', country:'DE'})
  && !billingPolicySupports('google_play', {platform:'android', distribution:'direct', country:'DE'}));

ok('Stripe is allowed only on web/direct channels',
  billingPolicySupports('stripe', {platform:'web', distribution:'web', country:'DE'})
  && billingPolicySupports('stripe', {platform:'android', distribution:'direct', country:'DE'})
  && billingPolicySupports('stripe', {platform:'ios', distribution:'direct', country:'US'})
  && !billingPolicySupports('stripe', {platform:'ios', distribution:'app_store', country:'US'})
  && !billingPolicySupports('stripe', {platform:'android', distribution:'google_play', country:'DE'}));

ok('YooKassa direct/web policy requires Russia',
  billingPolicySupports('yookassa', {platform:'web', distribution:'web', country:'RU'})
  && billingPolicySupports('yookassa', {platform:'android', distribution:'direct', country:'RU'})
  && !billingPolicySupports('yookassa', {platform:'web', distribution:'web', country:'DE'})
  && !billingPolicySupports('yookassa', {platform:'android', distribution:'google_play', country:'RU'}));

ok('unknown custom provider is not blocked by Core policy',
  billingPolicySupports('custom_test', {platform:'unknown', distribution:'unknown', country:''}));

const yoo = billingProviderPolicy('yookassa');
ok('Admin policy summary carries the same RU/direct scope',
  yoo?.countries?.join() === 'RU' && yoo?.distributions?.join() === 'web,direct' && yoo?.external === true);

const copy = billingProviderPolicy('stripe');
copy.platforms.push('tv');
ok('returned policy arrays cannot mutate the canonical source',
  !billingProviderPolicy('stripe').platforms.includes('tv'));

ok('policy list contains exactly the supported default providers',
  billingPolicyList().map(x => x.id).sort().join() === 'apple,google_play,stripe,yookassa');

console.log(bad ? `\nBilling policy failures: ${bad}` : '\nBilling policy behaves correctly');
process.exit(bad ? 1 : 0);
