/* External billing adapters: deterministic transport tests, no real network. */
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

process.env.ALLOW_MEMORY_STORE = '1';
const require = createRequire(import.meta.url);
const { configureProduct } = require('../server/product-core');
const { createStripeBillingAdapter } = require('../server/billing-providers/stripe');
const { createYooKassaBillingAdapter } = require('../server/billing-providers/yookassa');
const { createGooglePlayBillingAdapter } = require('../server/billing-providers/google-play');
const { createAppleStoreBillingAdapter, createApiToken, verifyAndDecodeAppleJws } = require('../server/billing-providers/apple-store');
const { saveBillingMapping } = require('../server/billing-catalog');

configureProduct({
  id:'test.billing',
  name:'Billing Test',
  slug:'billing-test',
  defaultPublicUrl:'https://app.example',
  products:[
    {sku:'pack.a', title:'Pack A', billing:{
      apple:{productId:'pack_a_ios'},
      google:{productId:'pack_a'}
    }},
    {sku:'plus.month', title:'Plus', kind:'subscription', days:30, billing:{
      apple:{productId:'plus_month_ios'},
      google:{productId:'plus_month'}
    }}
  ]
});

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

// Google Play: device gives only a purchase token; Core verifies it with Android Publisher.
const googleCalls = [];
const googleIdentity = {googleObfuscatedAccountId:'acct_1234567890abcdef'};
const google = createGooglePlayBillingAdapter({
  getServiceAccount:async () => ({clientEmail:'svc@example.test', privateKey:'unused', tokenUri:'https://oauth.test/token'}),
  getAccessToken:async () => 'access-token',
  resolveObfuscatedAccountId:async value => value === googleIdentity.googleObfuscatedAccountId
    ? {email:'payer@example.com'} : null,
  now:() => Date.parse('2030-01-01T00:00:00Z'),
  fetchImpl:async (url, init = {}) => {
    googleCalls.push({url, init});
    if(url.includes('/purchases/productsv2/tokens/item-token')){
      return jsonResponse({
        purchaseStateContext:{purchaseState:'PURCHASE_STATE_PURCHASED'},
        acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',
        obfuscatedExternalAccountId:googleIdentity.googleObfuscatedAccountId,
        orderId:'GPA.item.1',
        productLineItem:[{productId:'pack_a', productOfferDetails:{quantity:1, refundableQuantity:1}}]
      });
    }
    if(url.includes('/purchases/subscriptionsv2/tokens/sub-token')){
      return jsonResponse({
        subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',
        acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',
        externalAccountIdentifiers:{obfuscatedExternalAccountId:googleIdentity.googleObfuscatedAccountId},
        lineItems:[{
          productId:'plus_month',
          expiryTime:'2030-02-01T00:00:00Z',
          latestSuccessfulOrderId:'GPA.sub.1',
          autoRenewingPlan:{autoRenewEnabled:true}
        }]
      });
    }
    if(url.includes('/purchases/productsv2/tokens/wrong-account')){
      return jsonResponse({
        purchaseStateContext:{purchaseState:'PURCHASE_STATE_PURCHASED'},
        acknowledgementState:'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        obfuscatedExternalAccountId:'someone_else',
        orderId:'GPA.item.bad',
        productLineItem:[{productId:'pack_a'}]
      });
    }
    if(url.includes('/purchases/productsv2/tokens/item-overlay')){
      return jsonResponse({
        purchaseStateContext:{purchaseState:'PURCHASE_STATE_PURCHASED'},
        acknowledgementState:'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        obfuscatedExternalAccountId:googleIdentity.googleObfuscatedAccountId,
        orderId:'GPA.item.overlay',
        productLineItem:[{productId:'pack_a_admin', productOfferDetails:{quantity:1, refundableQuantity:1}}]
      });
    }
    if(url.includes('/purchases/productsv2/tokens/item-refunded')){
      return jsonResponse({
        purchaseStateContext:{purchaseState:'PURCHASE_STATE_PURCHASED'},
        acknowledgementState:'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        obfuscatedExternalAccountId:googleIdentity.googleObfuscatedAccountId,
        orderId:'GPA.item.refund',
        productLineItem:[{productId:'pack_a', productOfferDetails:{quantity:1, refundableQuantity:0}}]
      });
    }
    if(url.includes('/purchases/subscriptionsv2/tokens/sub-expired')){
      return jsonResponse({
        subscriptionState:'SUBSCRIPTION_STATE_EXPIRED',
        acknowledgementState:'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        externalAccountIdentifiers:{obfuscatedExternalAccountId:googleIdentity.googleObfuscatedAccountId},
        lineItems:[{
          productId:'plus_month',
          expiryTime:'2029-12-01T00:00:00Z',
          latestSuccessfulOrderId:'GPA.sub.expired',
          autoRenewingPlan:{autoRenewEnabled:false}
        }]
      });
    }
    if(url.endsWith(':acknowledge')) return jsonResponse({});
    return jsonResponse({}, 404);
  }
});
ok('Google Play is ready with a service account', await google.available());
const googleContext = await google.purchaseContext({
  product:{sku:'pack.a', billing:{google:{productId:'pack_a'}}},
  identity:googleIdentity
});
ok('Google purchase context keeps store SKU and opaque account id',
  googleContext.productId === 'pack_a' && googleContext.obfuscatedAccountId === googleIdentity.googleObfuscatedAccountId);

const googleItem = await google.verifyPurchase({
  product:{sku:'pack.a', kind:'owned', billing:{google:{productId:'pack_a'}}},
  proof:{purchaseToken:'item-token'},
  identity:googleIdentity
});
ok('Google verifies and normalizes one-time purchase',
  googleItem.events[0]?.status === 'paid' && googleItem.events[0]?.orderId === 'GPA.item.1');
ok('Google acknowledges a verified one-time purchase',
  googleCalls.some(x => x.url.includes('/purchases/products/pack_a/tokens/item-token:acknowledge') && x.init.method === 'POST'));

const googleSub = await google.verifyPurchase({
  product:{sku:'plus.month', kind:'subscription', billing:{google:{productId:'plus_month'}}},
  proof:{purchaseToken:'sub-token'},
  identity:googleIdentity
});
ok('Google verifies subscription expiry and renewal state',
  googleSub.events[0]?.status === 'paid'
  && googleSub.events[0]?.until === '2030-02-01T00:00:00Z'
  && googleSub.events[0]?.autoRenew === true);
ok('Google acknowledges a verified subscription',
  googleCalls.some(x => x.url.includes('/purchases/subscriptions/plus_month/tokens/sub-token:acknowledge') && x.init.method === 'POST'));
ok('Google rejects a token linked to another AppBase account',
  await google.verifyPurchase({
    product:{sku:'pack.a', kind:'owned', billing:{google:{productId:'pack_a'}}},
    proof:{purchaseToken:'wrong-account'},
    identity:googleIdentity
  }).then(() => false, e => e.message === 'store_account_mismatch' && e.status === 403));

const googleExpired = await google.verifyPurchase({
  product:{sku:'plus.month', kind:'subscription', billing:{google:{productId:'plus_month'}}},
  proof:{purchaseToken:'sub-expired'},
  identity:googleIdentity
});
ok('Google expired subscription is canceled, not mislabeled as a refund',
  googleExpired.events[0]?.status === 'canceled');

const pubsub = payload => ({message:{data:Buffer.from(JSON.stringify(payload)).toString('base64')}});

const googleRenewal = await google.verifyWebhook({body:pubsub({
  version:'1.0',
  packageName:'test.billing',
  subscriptionNotification:{version:'1.0', notificationType:2, purchaseToken:'sub-token'}
})});
ok('Google RTDN re-fetches a subscription before granting renewal',
  googleRenewal.ok
  && googleRenewal.events[0]?.status === 'paid'
  && googleRenewal.events[0]?.email === 'payer@example.com'
  && googleRenewal.events[0]?.sku === 'plus.month');

const googleRevoke = await google.verifyWebhook({body:pubsub({
  version:'1.0',
  packageName:'test.billing',
  subscriptionNotification:{version:'1.0', notificationType:12, purchaseToken:'sub-token'}
})});
ok('Google RTDN verified revocation becomes a refund event',
  googleRevoke.ok && googleRevoke.events[0]?.status === 'refunded');

const googleItemRtdn = await google.verifyWebhook({body:pubsub({
  version:'1.0',
  packageName:'test.billing',
  oneTimeProductNotification:{version:'1.0', notificationType:1, purchaseToken:'item-token', sku:'pack_a'}
})});
ok('Google RTDN re-fetches one-time purchase before granting',
  googleItemRtdn.ok
  && googleItemRtdn.events[0]?.status === 'paid'
  && googleItemRtdn.events[0]?.sku === 'pack.a');

const partialVoid = await google.verifyWebhook({body:pubsub({
  version:'1.0',
  packageName:'test.billing',
  voidedPurchaseNotification:{
    purchaseToken:'item-token', orderId:'GPA.item.1', productType:2, refundType:2
  }
})});
ok('Google partial quantity refund keeps entitlement while refundable quantity remains',
  partialVoid.ok && partialVoid.events.length === 0);

const fullVoid = await google.verifyWebhook({body:pubsub({
  version:'1.0',
  packageName:'test.billing',
  voidedPurchaseNotification:{
    purchaseToken:'item-refunded', orderId:'GPA.item.refund', productType:2, refundType:1
  }
})});
ok('Google full voided purchase revokes the mapped one-time product',
  fullVoid.ok
  && fullVoid.events[0]?.status === 'refunded'
  && fullVoid.events[0]?.sku === 'pack.a');

const foreignRtdn = await google.verifyWebhook({body:pubsub({
  version:'1.0',
  packageName:'test.billing',
  oneTimeProductNotification:{version:'1.0', notificationType:1, purchaseToken:'wrong-account', sku:'pack_a'}
})});
ok('Google RTDN cannot affect an unlinked account',
  foreignRtdn.ok && foreignRtdn.events.length === 0);

const wrongPackageRtdn = await google.verifyWebhook({body:pubsub({
  version:'1.0',
  packageName:'other.app',
  oneTimeProductNotification:{version:'1.0', notificationType:1, purchaseToken:'item-token', sku:'pack_a'}
})});
ok('Google RTDN ignores another package',
  wrongPackageRtdn.ok && wrongPackageRtdn.events.length === 0);

ok('Google RTDN rejects malformed Pub/Sub envelope',
  !(await google.verifyWebhook({body:{message:{data:'not-base64-json'}}})).ok);

// App Store: the phone gives a transaction id; Core fetches the transaction from Apple itself.
const appleIdentity = {appleAppAccountToken:'11111111-2222-4333-8444-555555555555'};
const fakeJws = payload => [
  Buffer.from(JSON.stringify({alg:'ES256'})).toString('base64url'),
  Buffer.from(JSON.stringify(payload)).toString('base64url'),
  'signature'
].join('.');

const {privateKey:applePrivateKey, publicKey:applePublicKey} = crypto.generateKeyPairSync('ec', {namedCurve:'P-256'});
const applePem = applePrivateKey.export({type:'pkcs8', format:'pem'});
const appleJwt = createApiToken({
  issuerId:'issuer-1',
  keyId:'KEY123',
  privateKey:applePem,
  bundleId:'test.billing'
}, 1_900_000_000);
const jwtParts = appleJwt.split('.');
const jwtHeader = JSON.parse(Buffer.from(jwtParts[0], 'base64url').toString('utf8'));
const jwtPayload = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString('utf8'));
ok('App Store API token uses ES256, key id and bundle id',
  jwtHeader.alg === 'ES256' && jwtHeader.kid === 'KEY123'
  && jwtPayload.aud === 'appstoreconnect-v1' && jwtPayload.bid === 'test.billing');
ok('App Store API token signature is valid ES256',
  crypto.verify('sha256', Buffer.from(jwtParts[0] + '.' + jwtParts[1]), {
    key:applePublicKey, dsaEncoding:'ieee-p1363'
  }, Buffer.from(jwtParts[2], 'base64url')));
ok('App Store rejects unsigned/untrusted transaction JWS by default',
  Promise.resolve().then(() => verifyAndDecodeAppleJws(fakeJws({transactionId:'fake'})))
    .then(() => false, e => e.message === 'apple_bad_certificate_chain'));

const appleCalls = [];
const appleTransactions = {
  'tx-owned':{
    transactionId:'tx-owned',
    originalTransactionId:'tx-owned',
    bundleId:'test.billing',
    productId:'pack_a_ios',
    appAccountToken:appleIdentity.appleAppAccountToken,
    purchaseDate:Date.parse('2030-01-01T00:00:00Z')
  },
  'tx-sub':{
    transactionId:'tx-sub',
    originalTransactionId:'tx-sub',
    bundleId:'test.billing',
    productId:'plus_month_ios',
    appAccountToken:appleIdentity.appleAppAccountToken,
    purchaseDate:Date.parse('2030-01-01T00:00:00Z'),
    expiresDate:Date.parse('2030-02-01T00:00:00Z')
  },
  'tx-refund':{
    transactionId:'tx-refund',
    originalTransactionId:'tx-refund',
    bundleId:'test.billing',
    productId:'pack_a_ios',
    appAccountToken:appleIdentity.appleAppAccountToken,
    purchaseDate:Date.parse('2030-01-01T00:00:00Z'),
    revocationDate:Date.parse('2030-01-02T00:00:00Z')
  },
  'tx-other-account':{
    transactionId:'tx-other-account',
    originalTransactionId:'tx-other-account',
    bundleId:'test.billing',
    productId:'pack_a_ios',
    appAccountToken:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  },
  'tx-overlay':{
    transactionId:'tx-overlay',
    originalTransactionId:'tx-overlay',
    bundleId:'test.billing',
    productId:'pack_a_ios_admin',
    appAccountToken:appleIdentity.appleAppAccountToken,
    purchaseDate:Date.parse('2030-01-03T00:00:00Z')
  }
};
const apple = createAppleStoreBillingAdapter({
  getCredentials:async () => ({issuerId:'issuer-1', keyId:'KEY123', privateKey:'present'}),
  getApiToken:async () => 'server-jwt',
  verifySignedData:async jws => JSON.parse(Buffer.from(String(jws).split('.')[1], 'base64url').toString('utf8')),
  resolveAppAccountToken:async token => token === appleIdentity.appleAppAccountToken
    ? {email:'payer@example.com'} : null,
  now:() => Date.parse('2030-01-15T00:00:00Z'),
  fetchImpl:async (url, init = {}) => {
    appleCalls.push({url, init});
    const href = String(url);
    const id = decodeURIComponent(href.split('/').pop());

    if(href.includes('/inApps/v1/subscriptions/')){
      if(id !== 'tx-sub') return jsonResponse({}, 404);
      return jsonResponse({
        environment:'Production',
        bundleId:'test.billing',
        data:[{
          subscriptionGroupIdentifier:'group-1',
          lastTransactions:[{
            originalTransactionId:'tx-sub',
            status:1,
            signedTransactionInfo:fakeJws(appleTransactions['tx-sub']),
            signedRenewalInfo:fakeJws({
              productId:'plus_month_ios',
              autoRenewProductId:'plus_month_ios',
              autoRenewStatus:1,
              renewalDate:Date.parse('2030-02-01T00:00:00Z'),
              appAccountToken:appleIdentity.appleAppAccountToken
            })
          }]
        }]
      });
    }

    if(id === 'tx-sandbox' && href.startsWith('https://api.storekit.apple.com')){
      return jsonResponse({}, 404);
    }
    const tx = id === 'tx-sandbox'
      ? {...appleTransactions['tx-owned'], transactionId:'tx-sandbox', originalTransactionId:'tx-sandbox'}
      : appleTransactions[id];
    if(!tx) return jsonResponse({}, 404);
    return jsonResponse({signedTransactionInfo:fakeJws(tx)});
  }
});
ok('App Store is ready with issuer, key id and private key', await apple.available());
const appleContext = await apple.purchaseContext({
  product:{sku:'pack.a', billing:{apple:{productId:'pack_a_ios'}}},
  identity:appleIdentity
});
ok('App Store purchase context contains StoreKit product and appAccountToken',
  appleContext.productId === 'pack_a_ios' && appleContext.appAccountToken === appleIdentity.appleAppAccountToken);

const appleOwned = await apple.verifyPurchase({
  product:{sku:'pack.a', kind:'owned', billing:{apple:{productId:'pack_a_ios'}}},
  proof:{transactionId:'tx-owned'},
  identity:appleIdentity
});
ok('App Store verifies one-time transaction through Server API',
  appleOwned.events[0]?.status === 'paid' && appleOwned.events[0]?.orderId === 'tx-owned');
ok('App Store request is authenticated server-side',
  appleCalls.some(x => x.url.endsWith('/inApps/v1/transactions/tx-owned') && x.init.headers.Authorization === 'Bearer server-jwt'));

const appleSub = await apple.verifyPurchase({
  product:{sku:'plus.month', kind:'subscription', billing:{apple:{productId:'plus_month_ios'}}},
  proof:{transactionId:'tx-sub'},
  identity:appleIdentity
});
ok('App Store resolves current subscription status and renewal preference',
  appleSub.events[0]?.status === 'paid'
  && appleSub.events[0]?.until === '2030-02-01T00:00:00.000Z'
  && appleSub.events[0]?.autoRenew === true);
ok('App Store subscription verification uses the current-status endpoint',
  appleCalls.some(x => x.url.endsWith('/inApps/v1/subscriptions/tx-sub')));

const appleRefund = await apple.verifyPurchase({
  product:{sku:'pack.a', kind:'owned', billing:{apple:{productId:'pack_a_ios'}}},
  proof:{transactionId:'tx-refund'},
  identity:appleIdentity
});
ok('App Store revocation becomes a refund event', appleRefund.events[0]?.status === 'refunded');

await apple.verifyPurchase({
  product:{sku:'pack.a', kind:'owned', billing:{apple:{productId:'pack_a_ios'}}},
  proof:{transactionId:'tx-sandbox'},
  identity:appleIdentity
});
ok('App Store falls back to sandbox only after production not-found',
  appleCalls.some(x => x.url.startsWith('https://api.storekit.apple.com/') && x.url.endsWith('/tx-sandbox'))
  && appleCalls.some(x => x.url.startsWith('https://api.storekit-sandbox.apple.com/') && x.url.endsWith('/tx-sandbox')));

ok('App Store rejects a transaction linked to another AppBase account',
  await apple.verifyPurchase({
    product:{sku:'pack.a', kind:'owned', billing:{apple:{productId:'pack_a_ios'}}},
    proof:{transactionId:'tx-other-account'},
    identity:appleIdentity
  }).then(() => false, e => e.message === 'store_account_mismatch' && e.status === 403));

const refundNotification = await apple.verifyWebhook({body:{
  signedPayload:fakeJws({
    notificationType:'REFUND',
    data:{signedTransactionInfo:fakeJws(appleTransactions['tx-refund'])}
  })
}});
ok('App Store notification re-fetches and normalizes a refund',
  refundNotification.ok
  && refundNotification.events[0]?.status === 'refunded'
  && refundNotification.events[0]?.email === 'payer@example.com'
  && refundNotification.events[0]?.sku === 'pack.a');

const renewalNotification = await apple.verifyWebhook({body:{
  signedPayload:fakeJws({
    notificationType:'DID_RENEW',
    data:{signedTransactionInfo:fakeJws(appleTransactions['tx-sub'])}
  })
}});
ok('App Store renewal notification resolves current status before changing access',
  renewalNotification.ok
  && renewalNotification.events[0]?.status === 'paid'
  && renewalNotification.events[0]?.autoRenew === true
  && renewalNotification.events[0]?.sku === 'plus.month');

const foreignNotification = await apple.verifyWebhook({body:{
  signedPayload:fakeJws({
    notificationType:'REFUND',
    data:{signedTransactionInfo:fakeJws(appleTransactions['tx-other-account'])}
  })
}});
ok('App Store notification cannot affect an unlinked account',
  foreignNotification.ok && foreignNotification.events.length === 0);

ok('App Store rejects a webhook without a signed payload',
  !(await apple.verifyWebhook({body:{}})).ok);

// Admin mapping overlay must affect already-created provider adapters and notification lookup.
await saveBillingMapping('pack.a', 'google_play', {productId:'pack_a_admin'});
const googleOverlayEvent = await google.verifyWebhook({body:pubsub({
  version:'1.0',
  packageName:'test.billing',
  oneTimeProductNotification:{version:'1.0', notificationType:1, purchaseToken:'item-overlay', sku:'pack_a_admin'}
})});
ok('Google RTDN resolves a product through the latest Admin mapping overlay',
  googleOverlayEvent.ok
  && googleOverlayEvent.events[0]?.sku === 'pack.a'
  && googleOverlayEvent.events[0]?.status === 'paid');

await saveBillingMapping('pack.a', 'apple', {productId:'pack_a_ios_admin'});
const appleOverlayEvent = await apple.verifyWebhook({body:{
  signedPayload:fakeJws({
    notificationType:'DID_RENEW',
    data:{signedTransactionInfo:fakeJws(appleTransactions['tx-overlay'])}
  })
}});
ok('App Store notification resolves a product through the latest Admin mapping overlay',
  appleOverlayEvent.ok
  && appleOverlayEvent.events[0]?.sku === 'pack.a'
  && appleOverlayEvent.events[0]?.status === 'paid');

console.log(bad ? `\nExternal billing provider failures: ${bad}` : '\nExternal billing providers behave correctly');
process.exit(bad ? 1 : 0);
