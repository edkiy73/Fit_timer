import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { AuthSession } from '@appbase/core/auth.js';
import product from '../config/product.json';
import type { ContentCatalogSet } from './content/client';
import { activePremium } from './entitlements';
import { localizedText } from './today-model';
import { billingClient } from './billing';

/* «Мои покупки» in the profile: courses bought forever, Plus with its date, a way to extend
   Plus and to restore purchases from another device (audit B2). */

function courseTitles(session:AuthSession, sets:ContentCatalogSet[], locale:string):string[]{
  const owned = new Set((session.owned ?? []).map(sku => String(sku).toLowerCase()));
  const titles:string[] = [];
  const named = new Set<string>();
  for(const set of sets){
    const access = set.access as {mode?:string; entitlement?:string} | null;
    const sku = access?.mode === 'entitlement' ? String(access.entitlement || '').toLowerCase() : '';
    if(sku && owned.has(sku)){ titles.push(localizedText(set.title, locale)); named.add(sku); }
  }
  // A course bought earlier but not in the catalog any more still shows by its product title.
  for(const item of product.products as Array<{sku:string; title:string; kind?:string}>){
    const sku = item.sku.toLowerCase();
    if(item.kind !== 'subscription' && owned.has(sku) && !named.has(sku)) titles.push(item.title);
  }
  return titles;
}

export function MyPurchases({session, sets, onRestore, setRenewal=(autoRenew:boolean)=>billingClient.setRenewal(autoRenew)}:{
  session:AuthSession;
  sets:ContentCatalogSet[];
  /** Re-reads rights from the server (after a purchase elsewhere or a renewal change). */
  onRestore:()=>Promise<void>;
  setRenewal?:(autoRenew:boolean)=>Promise<{url?:string; autoRenew:boolean}>;
}){
  const {t, locale} = useI18n();
  const navigate = useNavigate();
  const [restoring, setRestoring] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [restored, setRestored] = useState(false);
  const courses = courseTitles(session, sets, locale);
  const plus = activePremium(session, Date.now());
  const sub = session.sub as {until?:string; autoRenew?:boolean} | null | undefined;
  const until = sub?.until;
  // Plus is an auto-renewing subscription (owner decision). Until a payment provider is
  // connected the switch only changes the account's choice; with a provider it manages renewal there.
  const renews = plus && sub?.autoRenew === true;
  const [switching, setSwitching] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);
  const switchRenewal = async (next:boolean) => {
    setSwitching(true);
    setSwitchFailed(false);
    try{
      const result = await setRenewal(next);
      if(result.url){ window.location.assign(result.url); return; }
      await onRestore();
    }catch{ setSwitchFailed(true); }finally{ setSwitching(false); }
  };
  const date = until ? new Intl.DateTimeFormat(locale, {day:'numeric', month:'long', year:'numeric'}).format(new Date(until)) : '';

  const restore = async () => {
    setRestoring(true);
    setRestoreFailed(false);
    setRestored(false);
    try{ await onRestore(); setRestored(true); }catch{ setRestoreFailed(true); }finally{ setRestoring(false); }
  };

  return (
    <section className="profile-account" aria-labelledby="profile-purchases-title">
      <h3 id="profile-purchases-title">{t('purchases.title')}</h3>
      <div className="tile my-purchases">
        {courses.length > 0 ? (
          <ul className="my-purchases-list">
            {courses.map(title => (
              <li key={title}><strong>{title}</strong><span>{t('purchases.forever')}</span></li>
            ))}
          </ul>
        ) : null}
        <div className="my-purchases-plus">
          <div>
            <strong>UnMute Plus</strong>
            <span>{plus
              ? (date ? t(renews ? 'purchases.plusRenewsOn' : 'purchases.plusEndsOn', {date}) : t('purchases.plusActive'))
              : t('purchases.plusOff')}</span>
          </div>
          {!renews && (
            <button className="secondary-button" type="button" onClick={() => navigate('/access?from=me&return=' + encodeURIComponent('/account'))}>
              {plus ? t('purchases.plusExtend') : t('purchases.plusMore')}
            </button>
          )}
        </div>
        {plus && (
          <div className="my-purchases-renewal">
            <span className="tile-text">{t(renews ? 'purchases.plusRenewOff' : 'purchases.plusRenewHint')}</span>
            <button className="link-button" type="button" disabled={switching} onClick={() => void switchRenewal(!renews)}>
              {switching ? t('purchases.renewalSaving') : t(renews ? 'purchases.renewalOff' : 'purchases.renewalOn')}
            </button>
            {switchFailed && <span className="tile-text" role="alert">{t('purchases.renewalError')}</span>}
          </div>
        )}
        {!courses.length && !plus && <p className="tile-text">{t('purchases.none')}</p>}
        {restoreFailed && <p className="tile-text" role="alert">{t('access.refreshError')}</p>}
        {restored && !restoring && <p className="tile-text my-purchases-restored" role="status">{t(courses.length || plus ? 'purchases.restoreDone' : 'purchases.restoreNone')}</p>}
        <button className="link-button" type="button" disabled={restoring} onClick={() => void restore()}>
          {restoring ? t('access.refreshing') : t('purchases.restore')}
        </button>
      </div>
    </section>
  );
}
