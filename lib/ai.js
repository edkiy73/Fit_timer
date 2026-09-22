/* Серверная дверь к ИИ.

   Ключи провайдеров живут только в переменных окружения. Клиент знает лишь
   выбранные администратором модели и свои остатки лимитов. Провайдер меняется
   в админке без выпуска нового APK; при временной ошибке основной модели запрос
   один раз уходит резервной. */

const { store } = require('./store');

const DEFAULT_PRICES = {
  RUB:{month:399,year:2990}, USD:{month:4.99,year:39.99},
  EUR:{month:4.99,year:39.99}, GBP:{month:4.49,year:34.99},
  KZT:{month:2490,year:18900}, UAH:{month:199,year:1490},
  BYN:{month:14.9,year:109}, TRY:{month:169,year:1290}, PLN:{month:21.99,year:169}
};

const DEFAULTS = {
  enabled: true,
  retentionDays: 30,
  text: {
    primary: {provider:'gemini', model:'gemini-2.5-flash'},
    backup:  {provider:'openai', model:'gpt-5-mini'}
  },
  image: {
    primary: {provider:'gemini', model:'gemini-3.1-flash-image'},
    backup:  {provider:'openai', model:'gpt-image-1-mini'},
    size: '1K'
  },
  limits: {heavy:30, light:100, image:10},
  prices: DEFAULT_PRICES,
  payment: {provider:'not_connected', androidMonth:'', androidYear:'', iosMonth:'', iosYear:''}
};

const line = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n);
const num = (v, d, lo, hi) => Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : d;
const endpoint = v => ({
  provider: ['gemini','openai'].includes(v && v.provider) ? v.provider : 'gemini',
  model: line(v && v.model, 100)
});

function sanitizeSettings(src){
  src = src && typeof src === 'object' ? src : {};
  const text = src.text || DEFAULTS.text, image = src.image || DEFAULTS.image;
  const prices = {};
  Object.keys(DEFAULT_PRICES).forEach(cur => {
    const p = src.prices && src.prices[cur];
    prices[cur] = {
      month: num(p && p.month, DEFAULT_PRICES[cur].month, .01, 10000000),
      year: num(p && p.year, DEFAULT_PRICES[cur].year, .01, 100000000)
    };
  });
  const payment = src.payment || {};
  return {
    enabled: src.enabled !== false,
    retentionDays: Math.round(num(src.retentionDays, 30, 1, 30)),
    text: {
      primary: endpoint(text.primary || DEFAULTS.text.primary),
      backup: endpoint(text.backup || DEFAULTS.text.backup)
    },
    image: {
      primary: endpoint(image.primary || DEFAULTS.image.primary),
      backup: endpoint(image.backup || DEFAULTS.image.backup),
      size: ['512','1K','2K','4K'].includes(String(image.size || '')) ? String(image.size) : DEFAULTS.image.size
    },
    limits: {
      heavy: Math.round(num(src.limits && src.limits.heavy, 30, 0, 10000)),
      light: Math.round(num(src.limits && src.limits.light, 100, 0, 10000)),
      image: Math.round(num(src.limits && src.limits.image, 10, 0, 10000))
    },
    prices,
    payment: {
      provider: line(payment.provider || 'multi', 40),
      google: {
        enabled: payment.google ? payment.google.enabled !== false : true,
        month: line(payment.google && payment.google.month || payment.androidMonth, 120),
        year: line(payment.google && payment.google.year || payment.androidYear, 120)
      },
      rustore: {
        enabled: payment.rustore ? payment.rustore.enabled !== false : true,
        month: line(payment.rustore && payment.rustore.month, 120),
        year: line(payment.rustore && payment.rustore.year, 120)
      },
      yookassa: { enabled: payment.yookassa ? payment.yookassa.enabled !== false : true },
      androidMonth: line(payment.google && payment.google.month || payment.androidMonth, 120),
      androidYear: line(payment.google && payment.google.year || payment.androidYear, 120),
      iosMonth: line(payment.iosMonth, 120), iosYear: line(payment.iosYear, 120)
    }
  };
}

async function getSettings(){
  let saved = null;
  try{ saved = JSON.parse(await store.get('settings:ai')); }catch(e){}
  return sanitizeSettings(saved || DEFAULTS);
}

const keyFor = provider => provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
const providerStatus = () => ({gemini:!!process.env.GEMINI_API_KEY, openai:!!process.env.OPENAI_API_KEY});

async function fetchTimed(url, opts, timeoutMs){
  const ctl = new AbortController();
  // Перевод длинной программы и генерация изображений легко занимают больше 8–10 секунд.
  // Vercel-функции ниже получили больший maxDuration, поэтому даём провайдеру реальное
  // окно ответа и только после него переходим на резерв.
  const timer = setTimeout(()=> ctl.abort(), timeoutMs || 35000);
  try{ return await fetch(url, Object.assign({}, opts, {signal:ctl.signal})); }
  finally{ clearTimeout(timer); }
}

async function jsonError(res){
  let detail = '';
  try{ const j = await res.json(); detail = (j.error && (j.error.message || j.error)) || j.message || ''; }catch(e){}
  const err = new Error(line(detail, 500) || `HTTP ${res.status}`);
  err.status = res.status;
  throw err;
}

async function geminiText(ep, prompt){
  const res = await fetchTimed(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ep.model)}:generateContent`, {
    method:'POST', headers:{'Content-Type':'application/json','X-goog-api-key':keyFor('gemini') || ''},
    body:JSON.stringify({contents:[{parts:[{text:prompt}]}], generationConfig:{maxOutputTokens:32768,temperature:.3}})
  });
  if(!res.ok) return jsonError(res);
  const j = await res.json();
  const cand = (j.candidates || [])[0] || {};
  const text = (((cand.content || {}).parts) || []).map(x => x.text || '').join('').trim();
  if(!text) throw Object.assign(new Error('empty_response'), {status:502});
  return {text};
}

async function openaiText(ep, prompt){
  const res = await fetchTimed('https://api.openai.com/v1/responses', {
    method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${keyFor('openai') || ''}`},
    body:JSON.stringify({model:ep.model,input:prompt,max_output_tokens:32768})
  });
  if(!res.ok) return jsonError(res);
  const j = await res.json();
  const text = (j.output_text || (j.output || []).flatMap(x => x.content || []).map(x => x.text || '').join('')).trim();
  if(!text) throw Object.assign(new Error('empty_response'), {status:502});
  return {text};
}

async function geminiImage(ep, prompt, imageSize, aspectRatio){
  const size = ['512','1K','2K','4K'].includes(String(imageSize || '')) ? String(imageSize) : '1K';
  const ratio = ['1:1','4:3'].includes(String(aspectRatio || '')) ? String(aspectRatio) : '1:1';
  const res = await fetchTimed(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ep.model)}:generateContent`, {
    method:'POST', headers:{'Content-Type':'application/json','X-goog-api-key':keyFor('gemini') || ''},
    body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{imageSize:size,aspectRatio:ratio}}})
  });
  if(!res.ok) return jsonError(res);
  const j = await res.json();
  const parts = ((((j.candidates || [])[0] || {}).content || {}).parts) || [];
  const img = parts.find(x => x.inlineData && x.inlineData.data);
  if(!img) throw Object.assign(new Error('image_not_returned'), {status:502});
  return {image:`data:${img.inlineData.mimeType || 'image/png'};base64,${img.inlineData.data}`};
}

async function openaiImage(ep, prompt){
  const res = await fetchTimed('https://api.openai.com/v1/images/generations', {
    method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${keyFor('openai') || ''}`},
    body:JSON.stringify({model:ep.model,prompt,size:'1024x1024',quality:'low',response_format:'b64_json'})
  });
  if(!res.ok) return jsonError(res);
  const j = await res.json(), first = (j.data || [])[0] || {};
  if(!first.b64_json) throw Object.assign(new Error('image_not_returned'), {status:502});
  return {image:`data:image/png;base64,${first.b64_json}`};
}

async function callOne(type, ep, prompt, imageSize, aspectRatio){
  if(!keyFor(ep.provider)) throw Object.assign(new Error('provider_not_configured'), {status:503});
  if(process.env.AI_TEST_MODE === '1') return type === 'image'
    ? {image:'data:image/png;base64,iVBORw0KGgo='} : {text:'ТЕСТОВЫЙ ОТВЕТ ИИ'};
  if(type === 'image') return ep.provider === 'gemini' ? geminiImage(ep, prompt, imageSize, aspectRatio) : openaiImage(ep, prompt);
  return ep.provider === 'gemini' ? geminiText(ep, prompt) : openaiText(ep, prompt);
}

const mayFallback = e => !e.status || e.status === 404 || e.status === 408 || e.status === 429 || e.status >= 500;
async function generate(type, settings, prompt, options){
  const route = settings[type];
  const aspectRatio = type === 'image' && options ? options.aspectRatio : null;
  let first;
  try{
    const out = await callOne(type, route.primary, prompt, type === 'image' ? route.size : null, aspectRatio);
    return Object.assign(out, {provider:route.primary.provider,model:route.primary.model,fallback:false});
  }catch(e){ first = e; }
  const different = route.backup.provider !== route.primary.provider || route.backup.model !== route.primary.model;
  if(!different || !mayFallback(first)) throw first;
  // Не маскируем реальную ошибку основного провайдера ошибкой
  // provider_not_configured, если резервный ключ вообще не подключён.
  if(!keyFor(route.backup.provider)) throw first;
  const out = await callOne(type, route.backup, prompt, type === 'image' ? route.size : null, aspectRatio);
  return Object.assign(out, {provider:route.backup.provider,model:route.backup.model,fallback:true});
}

function billingProviderStatus(){
  return {
    google: !!(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64),
    rustore: !!(process.env.RUSTORE_PAY_PRIVATE_KEY || process.env.RUSTORE_PAY_TOKEN || process.env.RUSTORE_API_TOKEN),
    yookassa: !!(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY)
  };
}

module.exports = { DEFAULTS, DEFAULT_PRICES, sanitizeSettings, getSettings, providerStatus, billingProviderStatus, generate };
