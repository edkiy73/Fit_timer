/* Отправка писем. Сейчас Resend, но так же как с хранилищем — через один файл:
   почтовый сервис выбирают не навсегда, а менять его должно стоить одну правку
   здесь, а не переписывание эндпоинтов.

   Две переменные окружения:
   • RESEND_API_KEY — ключ с resend.com, без него писем не будет вовсе;
   • MAIL_FROM — от кого. По умолчанию адрес на тестовом домене Resend, а с него
     письма уходят ТОЛЬКО на почту владельца ключа. Это не наша выдумка и не
     ошибка настройки — так устроен Resend без своего домена. */

const KEY  = () => process.env.RESEND_API_KEY || '';
const { productIdentity } = require('./product-core');
const FROM = () => process.env.MAIL_FROM || `${productIdentity().name} <onboarding@resend.dev>`;
// Тестовый домен Resend: с него нельзя писать никому, кроме себя. Знать это надо
// заранее — иначе «письмо не пришло» разбирают часами, а причина одна и та же.
const testDomain = () => /@resend\.dev>?\s*$/.test(FROM());

async function sendMail({to, subject, text, html}){
  if(!KEY()) throw Object.assign(new Error('no_mail_key'), {code: 'no_mail_key'});
  let res, data;
  try{
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + KEY(), 'Content-Type': 'application/json'},
      body: JSON.stringify({from: FROM(), to: [to], subject, text, html})
    });
    data = await res.json().catch(()=> ({}));
  }catch(e){
    throw Object.assign(new Error('mail_unreachable'), {code: 'mail_failed', detail: String(e && e.message || e)});
  }
  if(!res.ok){
    /* Причину отдаём НАВЕРХ, а не прячем в журнал. Отказы Resend почти всегда про
       настройку («домен не подтверждён», «на тестовом домене можно писать только
       себе»), и человеку, который эту настройку и делает, надо прочитать их
       словами, а не гадать по «не удалось отправить». */
    throw Object.assign(new Error('mail_rejected'), {
      code: 'mail_failed',
      detail: (data && (data.message || data.error || data.name)) || ('http_' + res.status),
      testDomain: testDomain()
    });
  }
  return data;
}

// Что видно снаружи: настроена ли почта и чем именно. Ключ не показываем никогда.
const mailInfo = () => ({
  ready: !!KEY(),
  from: KEY() ? FROM() : null,
  testDomain: testDomain(),
  seen: Object.keys(process.env).filter(k => /^(RESEND_|MAIL_)/.test(k)).sort()
});

module.exports = { sendMail, mailInfo, testDomain };
