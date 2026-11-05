// @ts-check
/** Robokassa (docs/infra/payments.md): one paid term per payment, no automatic renewal (Premium simply ends). The shop's
 * keys come from the environment; without them this provider is not created and purchases answer «payments_unavailable».
 *   ROBOKASSA_LOGIN, ROBOKASSA_PASSWORD1 (for the pay link), ROBOKASSA_PASSWORD2 (for the notification),
 *   ROBOKASSA_RATE_EUR_RUB (prices are in euros, the shop takes roubles), ROBOKASSA_TEST=1 (test payments).
 * In the shop's settings: Result URL  https://app.kinhaze.com/api/fe?pay-events=robokassa  (POST),
 *                         Success URL https://app.kinhaze.com/api/fe?pay-return=robokassa  (GET), the same for Fail URL;
 *                         the signature algorithm is MD5.
 * NOT yet tried against a real shop: first run it with ROBOKASSA_TEST=1.
 * @typedef {import('../commands/premium.mjs').PaymentProvider} PaymentProvider */
import { createHash } from 'node:crypto';

const md5 = (/** @type {string} */ s) => createHash('md5').update(s).digest('hex');
const PAY_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx';

/** @param {Record<string, string | undefined>} env @returns {PaymentProvider | null} */
export function robokassa(env) {
  const login = env.ROBOKASSA_LOGIN, pass1 = env.ROBOKASSA_PASSWORD1, pass2 = env.ROBOKASSA_PASSWORD2;
  const rate = Number(env.ROBOKASSA_RATE_EUR_RUB);
  if (!login || !pass1 || !pass2 || !(rate > 0)) return null;
  return {
    id: 'robokassa', store: 'web', recurring: false,
    async checkout({ purchase }) {
      // The price is in euro cents; the shop takes roubles, two decimals.
      const sum = (Math.round(purchase.amountCents * rate) / 100).toFixed(2);
      const shp = `Shp_p=${purchase.id}`;
      const params = new URLSearchParams({
        MerchantLogin: login, OutSum: sum, InvId: String(purchase.invId), Description: 'KINHAZE Premium', Culture: 'ru',
        SignatureValue: md5(`${login}:${sum}:${purchase.invId}:${pass1}:${shp}`), Shp_p: purchase.id,
        ...(env.ROBOKASSA_TEST === '1' ? { IsTest: '1' } : {}),
      });
      return { url: `${PAY_URL}?${params}` };
    },
    async webhook({ rawBody }) {
      // The Result URL call: a form `OutSum=…&InvId=…&SignatureValue=…&Shp_p=…`. Checked with password #2 over the received text.
      const f = new URLSearchParams(rawBody);
      const sum = f.get('OutSum') ?? '', inv = f.get('InvId') ?? '', sig = (f.get('SignatureValue') ?? '').toLowerCase(), p = f.get('Shp_p') ?? '';
      if (!sum || !/^\d+$/.test(inv) || !p || md5(`${sum}:${inv}:${pass2}:Shp_p=${p}`) !== sig) throw new Error('bad_signature');
      return { events: [{ type: 'paid', purchaseId: p, storeRef: inv }], reply: { status: 200, body: `OK${inv}` } };
    },
  };
}
