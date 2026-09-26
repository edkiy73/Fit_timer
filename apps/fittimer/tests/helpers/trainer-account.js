/* Тренер существует только внутри аккаунта: страницу тренера сервер сохраняет
   лишь для подтверждённой почты с ником (api/trainer/[handle].js → account_required).
   Хелпер проходит тот же путь, что приложение: код на почту → вход → ник →
   режим тренера → «Сохранить» профиль тренера (pushProfile).

   Используется браузерными тестами против tests/dev-server.js: локальный сервер
   возвращает код прямо в ответе (devCode) и принимает тестовую подписку. */

const randomMail = prefix => (prefix || 'coach') + '.' + Math.random().toString(36).slice(2, 9) + '@example.com';

// page — страница приложения после онбординга (профиль уже есть).
// opts.handle — ник с «@»; opts.trainer — поля страницы (name, about, years, links, photo);
// opts.email — почта (по умолчанию случайная); opts.premium — выдать тестовую подписку.
async function becomeTrainer(page, opts){
  const o = Object.assign({email: randomMail(), trainer: {}, premium: false}, opts || {});
  return page.evaluate(async o => {
    const sent = await apiPost('/api/auth', {action: 'send', email: o.email});
    const sub = o.premium
      ? {plan: 'year', since: '2026-09-17', until: '2099-09-17', currency: 'RUB', price: 2990, autoRenew: true}
      : undefined;
    const r = await apiPost('/api/auth', {action: 'verify', email: o.email, code: sent.devCode,
      deviceId: identity.deviceId, sub});
    const claimed = await apiPost('/api/auth', {action: 'set_handle', email: o.email,
      deviceId: identity.deviceId, syncToken: r.syncToken, handle: o.handle});
    account.email = o.email;
    account.syncToken = r.syncToken;
    account.handle = claimed.handle;
    account.sub = r.sub || null;
    account.linkedAt = new Date().toISOString();
    await saveAccount();
    identity.email = o.email; await saveIdentity();
    await enableTrainerMode();
    trainer = Object.assign({}, trainer, o.trainer, {handle: account.handle, on: true});
    await saveTrainer({deferSync: true});
    const ok = await pushProfile();
    await saveTrainer({deferSync: true});
    return {ok, email: o.email, handle: account.handle, key: trainer.key || '', err: trainer.pageErr || ''};
  }, o);
}

module.exports = {becomeTrainer, randomMail};
