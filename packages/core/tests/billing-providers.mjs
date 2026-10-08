/* External billing adapters: deterministic transport tests, no real network. */
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const { configureProduct } = require('../server/product-core');
const { createStripeBillingAdapter } = require('../server/billing-providers/stripe');
const { createYooKassaBillingAdapter } = require('../server/billing-providers/yookassa');

configureProduct({id:'test.billing', name:'Billing Test', slug:'billing-test', defaultPublicUrl:'https://app.example', products:[]});

let bad = 0;
const ok = (name, cond, detail = '') => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (detail ? '  → ' + detail : ''));
};

const jsonResponse = (body, status = 200) => ({
  ok:status >= 200 && status < 300,
  status,
  async json(){ return body; }
});

// Stripe checkout.
const stripeCalls = [];
const stripe = createStripeBillingAdapter({
  getCredentials:async () => ({key:'sk_test_core', webhook:'whsec_core'}),
  now:() => 1_800_000_000_000,
  fetchImpl:async (url, init) => {
    stripeCalls.push({url, init});
    return jsonResponse({id:'cs_test_1', url:'https://checkout.stripe.test/session'});
  }
});
ok('Stripe is ready only with server credentials', await stripe.available());
const stripeCheckout = await stripe.checkout({
  email:'payer@example.com',
  sku:'pack.a',
  product:{sku:'pack.a', title:'Pack A', kind:'owned', billing:{stripe:{priceId:'price_pack_a'}}}
});
const stripeForm = new URLSearchParams(String(stripeCalls[0]?.init?.body || ''));
ok('Stripe creates hosted Checkout', stripeCheckout.url === 'https://checkout.stripe.test/session');
ok('Stripe sends configured Price and one-time mode',
  stripeForm.get('line_items[0][price]') === 'price_pack_a' && stripeForm.get('mode') === 'payment');
ok('Stripe propagates AppBase metadata to PaymentIntent',
  !!stripeForm.get('payment_intent_data[metadata][appbase_order]')
  && stripeForm.get('payment_intent_data[metadata][appbase_sku]') === 'pack.a'
  && stripeForm.get('payment_intent_data[metadata][appbase_email]') === 'payer@example.com');
ok('Stripe uses public product return URLs',
  stripeForm.get('success_url') === 'https://app.example/#/account?billing=success'
  && stripeForm.get('cancel_url') === 'https://app.example/#/account?billing=cancel');

const order = stripeForm.get('metadata[appbase_order]');
const stripeRaw = JSON.stringify({
  id:'evt_1',
  type:'checkout.session.completed',
  data:{object:{
    id:'cs_test_1',
    mode:'payment',
    payment_status:'paid',
    metadata:{appbase_order:order, appbase_email:'payer@example.com', appbase_sku:'pack.a'}
  }}
});
const ts = Math.floor(1_800_000_000_000 / 1000);
const sig = crypto.createHmac('sha256', 'whsec_core').update(ts + '.' + stripeRaw).digest('hex');
const stripeVerified = await stripe.verifyWebhook({headers:{'stripe-signature':`t=${ts},v1=${sig}`}, rawBody:stripeRaw});
ok('Stripe verifies the raw signed webhook',
  stripeVerified.ok && stripeVerified.events[0]?.status === 'paid' && stripeVerified.events[0]?.orderId === order);
ok('Stripe refuses a webhook without raw body',
  !(await stripe.verifyWebhook({headers:{'stripe-signature':`t=${ts},v1=${sig}`}, rawBody:''})).ok);
ok('Stripe refuses an old signed webhook',
  !(await stripe.verifyWebhook({headers:{'stripe-signature':`t=${ts - 1000},v1=${sig}`}, rawBody:stripeRaw})).ok);

const stripeSubCalls = [];
const stripeSub = createStripeBillingAdapter({
  getCredentials:async () => ({key:'sk_test_core', webhook:'whsec_core'}),
  fetchImpl:async (url, init) => { stripeSubCalls.push({url, init}); return jsonResponse({url:'https://checkout.stripe.test/sub'}); }
});
await stripeSub.checkout({
  email:'payer@example.com',
  sku:'plus.month',
  product:{sku:'plus.month', title:'Plus', kind:'subscription', days:30, billing:{stripe:{priceId:'price_plus_month'}}}
});
const subForm = new URLSearchParams(String(stripeSubCalls[0].init.body));
ok('Stripe subscription uses subscription mode and propagates metadata',
  subForm.get('mode') === 'subscription'
  && subForm.get('subscription_data[metadata][appbase_sku]') === 'plus.month');
ok('Stripe refuses a product without a configured provider SKU',
  await stripe.checkout({email:'payer@example.com', sku:'pack.b', product:{sku:'pack.b'}})
    .then(() => false, e => e.message === 'provider_sku_unconfigured'));

// YooKassa checkout + verified notifications.
const yooCalls = [];
const payment = {
  id:'pay_1',
  status:'succeeded',
  metadata:{appbase_order:'ab_yoo_1', appbase_email:'payer@example.com', appbase_sku:'pack.a'}
};
const yookassa = createYooKassaBillingAdapter({
  getCredentials:async () => ({shopId:'shop-1', key:'secret-1'}),
  fetchImpl:async (url, init = {}) => {
    yooCalls.push({url, init});
    if(url.endsWith('/payments') && init.method === 'POST'){
      return jsonResponse({id:'pay_created', status:'pending', confirmation:{confirmation_url:'https://yookassa.test/pay'}});
    }
    if(url.endsWith('/payments/pay_1')) return jsonResponse(payment);
    if(url.endsWith('/payments/pay_cancel')) return jsonResponse({...payment, id:'pay_cancel', status:'canceled'});
    if(url.endsWith('/refunds/ref_1')) return jsonResponse({id:'ref_1', status:'succeeded', payment_id:'pay_1'});
    return jsonResponse({}, 404);
  }
});
ok('YooKassa is ready only with server credentials', await yookassa.available());
const yooCheckout = await yookassa.checkout({
  email:'payer@example.com',
  sku:'pack.a',
  product:{sku:'pack.a', title:'Pack A', kind:'owned', billing:{yookassa:{amount:399, currency:'RUB'}}}
});
const yooCreate = yooCalls.find(x => x.url.endsWith('/payments') && x.init.method === 'POST');
const yooBody = JSON.parse(String(yooCreate.init.body));
ok('YooKassa creates redirect checkout with exact amount',
  yooCheckout.url === 'https://yookassa.test/pay'
  && yooBody.amount.value === '399.00'
  && yooBody.amount.currency === 'RUB'
  && yooBody.capture === true);
ok('YooKassa sends idempotency and AppBase metadata',
  /^ab_/.test(String(yooCreate.init.headers['Idempotence-Key']))
  && yooBody.metadata.appbase_sku === 'pack.a'
  && yooBody.metadata.appbase_email === 'payer@example.com');
ok('YooKassa keeps credentials in server Authorization',
  String(yooCreate.init.headers.Authorization).startsWith('Basic '));

const yooPaid = await yookassa.verifyWebhook({body:{event:'payment.succeeded', object:{id:'pay_1'}}});
ok('YooKassa re-fetches payment before granting access',
  yooPaid.ok && yooPaid.events[0]?.status === 'paid' && yooPaid.events[0]?.orderId === 'ab_yoo_1');

const yooCanceled = await yookassa.verifyWebhook({body:{event:'payment.canceled', object:{id:'pay_cancel'}}});
ok('YooKassa verifies cancellation against the API',
  yooCanceled.ok && yooCanceled.events[0]?.status === 'canceled');

const yooRefund = await yookassa.verifyWebhook({body:{event:'refund.succeeded', object:{id:'ref_1'}}});
ok('YooKassa verifies refund and maps it to the original AppBase order',
  yooRefund.ok && yooRefund.events[0]?.status === 'refunded' && yooRefund.events[0]?.orderId === 'ab_yoo_1');

ok('YooKassa refuses a product without amount/currency mapping',
  await yookassa.checkout({email:'payer@example.com', sku:'pack.b', product:{sku:'pack.b'}})
    .then(() => false, e => e.message === 'provider_sku_unconfigured'));

console.log(bad ? `\nExternal billing provider failures: ${bad}` : '\nExternal billing providers behave correctly');
process.exit(bad ? 1 : 0);
