/* ================= ПРЕДУСТАНОВЛЕННАЯ РАЗМИНКА ================= */
function warmupProgram(){
  const WMUS = {
    'Марш на месте': ['le','ca'],
    'Вращения плечами и руками': ['sh','ar'],
    'Наклоны корпуса в стороны': ['co','ba'],
    'Вращения тазом': ['co','gl'],
    'Приседания в лёгком темпе': ['le','gl'],
    'Выпады на месте попеременно': ['le','gl'],
    'Мельница': ['co','ba','le'],
    'Вращения коленями и стопами': ['le','ca'],
    'Прыжки Jumping Jack': ['le','ca','sh'],
    'Растяжка: наклон к стопам': ['ba','le']
  };
  const ex = (name, desc, type, value, rest) => ({name, desc, video:'', type, value, rest, media: null, muscles: WMUS[name] || [], mistakes: ''});
  return {
    id: 'warmup', name: 'Разминка 10 минут', time: '', cover: null, stats: {completions: 0},
    plans: [{days: [], rounds: 1, roundRest: 0, exercises: [
      ex('Марш на месте', 'Шагай на месте в бодром темпе, высоко поднимая колени. Руки работают, как при ходьбе. Дыши ровно — задача разогреть тело, а не устать.', 'time', 60, 10),
      ex('Вращения плечами и руками', 'Сначала 20 секунд вращай плечами назад и вперёд, затем выпрями руки и рисуй ими большие круги. Двигайся плавно, с полной амплитудой.', 'time', 45, 10),
      ex('Наклоны корпуса в стороны', 'Ноги на ширине плеч, одна рука на поясе, вторая тянется над головой в сторону наклона. Наклоняйся строго вбок, не заваливаясь вперёд. Меняй стороны.', 'time', 45, 10),
      ex('Вращения тазом', 'Руки на пояс, ноги на ширине плеч. Рисуй тазом большие круги: сначала в одну сторону, на половине времени — в другую. Колени чуть согнуты.', 'time', 30, 10),
      ex('Приседания в лёгком темпе', 'Присядь до комфортной глубины, отводя таз назад, колени в сторону носков. Темп спокойный: это разогрев суставов, а не силовая работа.', 'reps', 15, 15),
      ex('Выпады на месте попеременно', 'Шаг вперёд, заднее колено мягко опускается к полу, затем вернись и смени ногу. Корпус прямой, движение плавное, без рывков.', 'reps', 12, 15),
      ex('Мельница', 'Ноги шире плеч, корпус наклонён вперёд, руки в стороны. Поочерёдно тянись рукой к противоположной стопе, вторая рука уходит вверх.', 'time', 30, 10),
      ex('Вращения коленями и стопами', 'Соедини колени, слегка присядь и повращай ими по кругу в обе стороны. Затем по очереди поставь стопы на носок и повращай голеностопом.', 'time', 45, 10),
      ex('Прыжки Jumping Jack', 'В прыжке разводи ноги и поднимай руки над головой, затем возвращайся. Если прыгать нельзя — шагай в стороны с подъёмом рук.', 'time', 45, 10),
      ex('Растяжка: наклон к стопам', 'Медленно наклонись вниз, расслабив спину и шею, и потянись к стопам. Колени можно слегка согнуть. Дыши глубоко и не пружинь.', 'time', 40, 0)
    ]}]
  };
}
async function ensureWarmup(){
  if((await kvGet(pk('warmupAdded'))) === '1') return;
  if(!customPrograms.some(p => p.id === 'warmup')){
    customPrograms.unshift(warmupProgram());
    await savePrograms();
  }
  kvSet(pk('warmupAdded'), '1');
}

/* ================= ФОТО-ПРОГРЕСС ================= */
let photos = []; // [{d:'ГГГГ-ММ-ДД', img:dataURL}] — отдельный ключ хранилища, фото тяжёлые
async function loadPhotos(){
  try{ photos = JSON.parse(await kvGet(pk('photos'))) || []; }catch(e){ photos = []; }
}
async function savePhotos(){ await kvSet(pk('photos'), JSON.stringify(photos)); }

function fmtD(iso){
  const d = new Date(iso + 'T12:00:00');
  return new Intl.DateTimeFormat(localeTag(), {day:'numeric', month:'short', year:'2-digit'}).format(d);
}
function shortD(iso){
  const d = new Date(iso + 'T12:00:00');
  return new Intl.DateTimeFormat(localeTag(), {day:'numeric', month:'short'}).format(d);
}

function renderPhotos(){
  const n = photos.length;
  $('photoCount').textContent = n ? t('progress.photoCount',{count:n}) : '';
  setShown('photoNowRow', !!n);
  const hint = $('photoHint');
  if(n){
    const last = new Date(photos[photos.length - 1].d);
    const days = Math.floor((new Date() - last) / 86400000);
    hint.textContent = days >= 7 ? t('progress.photoUpdate') : '';
    hint.style.color = 'var(--danger)';
  } else hint.textContent = '';

  // сетка вместо ленты: шестой снимок больше не обрезается краем экрана,
  // и у каждого подписана дата — иначе непонятно, что с чем сравнивать
  const strip = $('photoStrip');
  strip.innerHTML = '';
  photos.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ph-item';
    b.innerHTML = `<img src="${esc(p.img)}" alt=""><small>${shortD(p.d)}</small>`;
    b.onclick = ()=> openCompare(i);
    strip.appendChild(b);
  });
  setShown(strip, !!n);
  setShown('photoEmpty', !n);
  setShown('photoActions', n >= 2);
  setShown('btnDeleteAllPhotos', n > 0);
}

async function deleteAllPhotos(){
  if(!photos.length) return;
  const ok = await appDialog(
    t('progress.deleteAllPhotos',{count:photos.length}),
    {confirm: true, okText: t('common.delete'), cancelText: t('common.cancel'), type: t('progress.deleteConfirmPhrase')}
  );
  if(!ok) return;
  photos = [];
  await savePhotos();
  renderPhotos();
}

// Один день — один снимок: второе фото за ту же дату заменяет первое. Раньше замена
// происходила молча, и человек терял утренний кадр, сняв вечерний «на пробу».
async function addPhoto(file){
  const today = localISO(new Date());
  if(photos.some(p => p.d === today)){
    const ok = await appDialog(
      t('progress.todayReplace'),
      {confirm: true, okText: t('common.replace'), cancelText: t('common.cancel')}
    );
    if(!ok) return;
  }
  shrinkImage(file, 480, async dataUrl => {
    const ex = photos.find(p => p.d === today);
    if(ex) ex.img = dataUrl; else photos.push({d: today, img: dataUrl});
    photos.sort((a, b) => a.d < b.d ? -1 : 1);
    if(photos.length > 40) photos = photos.slice(-40); // защита хранилища
    await savePhotos();
    renderPhotos();
  });
}

function fillCmpSel(sel, idx){
  sel.innerHTML = '';
  photos.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = fmtD(p.d);
    if(i === idx) o.selected = true;
    sel.appendChild(o);
  });
}
function renderCmp(){
  const a = photos[+$('cmpA').value], b = photos[+$('cmpB').value];
  $('cmpImgA').innerHTML = a ? `<img src="${esc(a.img)}" alt="">` : '';
  $('cmpImgB').innerHTML = b ? `<img src="${esc(b.img)}" alt="">` : '';
  if(a && b){
    const days = Math.abs(Math.round((new Date(b.d) - new Date(a.d)) / 86400000));
    $('cmpDays').textContent = days
      ? t('progress.daysBetween',{count:days,days:appLocale === 'ru' ? plural(days,'день','дня','дней') : (days === 1 ? 'day' : 'days')})
      : t('progress.sameDay');
  }
}
// нажатие на снимок в сетке открывает сравнение сразу с ним справа,
// нажатие на кнопку — крайние даты (было/стало)
function openCompare(bIdx){
  if(photos.length < 2) return;
  const b = (typeof bIdx === 'number' && bIdx > 0) ? bIdx : photos.length - 1;
  fillCmpSel($('cmpA'), 0);
  fillCmpSel($('cmpB'), b);
  renderCmp();
  $('cmpModal').classList.add('open');
}

// свайп по фото в сравнении: влево — следующая дата, вправо — предыдущая.
// без оборота по кругу; правое фото не может стать раньше или равным левому
function cmpStep(which, dir){
  const selId = which === 'A' ? 'cmpA' : 'cmpB';
  const other = which === 'A' ? +$('cmpB').value : +$('cmpA').value;
  let idx = +$(selId).value + dir;
  if(idx < 0 || idx > photos.length - 1) return; // край — дальше некуда, свайп молча гасится
  if(which === 'A' && idx >= other) return;       // левое не может обогнать/сравняться с правым
  if(which === 'B' && idx <= other) return;       // правое не может стать раньше/равным левому
  $(selId).value = idx;
  renderCmp();
}
/* ---- снимок во весь экран ---- */
let pfIdx = 0;
function openPhotoFull(i){
  if(!photos.length) return;
  pfIdx = Math.max(0, Math.min(photos.length - 1, i));
  renderPhotoFull();
  $('photoFullModal').classList.add('open');
}
function renderPhotoFull(){
  const p = photos[pfIdx];
  if(!p) return;
  $('pfImg').src = p.img;
  $('pfCap').textContent = fmtD(p.d) + (photos.length > 1 ? ' · ' + t('progress.photoPosition',{current:pfIdx+1,total:photos.length}) : '');
}
function pfStep(d){
  const n = pfIdx + d;
  if(n < 0 || n > photos.length - 1) return;
  pfIdx = n;
  renderPhotoFull();
}
// свайп и нажатие живут на одном элементе, поэтому после свайпа гасим ближайший клик:
// иначе каждое пролистывание заодно открывало снимок во весь экран
const justSwiped = el => Date.now() - (+(el.dataset.swiped || 0)) < 400;
function wireSwipe(el, onLeft, onRight){
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', e => {
    const t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY;
  }, {passive: true});
  el.addEventListener('touchend', e => {
    if(x0 == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if(Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // слишком коротко или вертикально — не свайп
    el.dataset.swiped = String(Date.now());
    if(dx < 0) onLeft(); else onRight();
  }, {passive: true});
}
wireSwipe($('cmpImgA'), ()=> cmpStep('A', 1), ()=> cmpStep('A', -1));
wireSwipe($('cmpImgB'), ()=> cmpStep('B', 1), ()=> cmpStep('B', -1));
wireSwipe($('pfImg'), ()=> pfStep(1), ()=> pfStep(-1));
$('cmpImgA').onclick = ()=>{ if(!justSwiped($('cmpImgA'))) openPhotoFull(+$('cmpA').value); };
$('cmpImgB').onclick = ()=>{ if(!justSwiped($('cmpImgB'))) openPhotoFull(+$('cmpB').value); };
$('photoFullModal').onclick = e => { if(e.target === $('photoFullModal')) $('photoFullModal').classList.remove('open'); };
async function delCmpPhoto(which){
  const idx = +$(which).value;
  const p = photos[idx];
  if(!p) return;
  if(!(await appConfirm(t('progress.deletePhoto',{date:fmtD(p.d)})))) return;
  photos.splice(idx, 1);
  await savePhotos();
  renderPhotos();
  if(photos.length < 2){ $('cmpModal').classList.remove('open'); return; }
  fillCmpSel($('cmpA'), 0);
  fillCmpSel($('cmpB'), photos.length - 1);
  renderCmp();
}

function loadImg(src){
  return new Promise(res => { const i = new Image(); i.onload = ()=> res(i); i.onerror = ()=> res(null); i.src = src; });
}
function drawCover(x, img, dx, dy, dw, dh, r){
  x.save();
  roundRect(x, dx, dy, dw, dh, r);
  x.clip();
  const s = Math.max(dw / img.width, dh / img.height);
  const sw = dw / s, sh = dh / s;
  x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, dx, dy, dw, dh);
  x.restore();
}
async function shareGeneratedFile(blob, fname, title, savedText){
  if(window.FitNative && window.FitNative.isNative){
    const ok = await window.FitNative.shareFile(blob, fname, title || 'Fit Timer');
    if(!ok) appAlert(t('share.openFailed'));
    return ok;
  }
  const file = new File([blob], fname, {type:blob.type || 'application/octet-stream'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:title || 'Fit Timer'}); return true; }
    catch(e){ if(e && e.name === 'AbortError') return true; }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fname;
  link.click();
  setTimeout(()=> URL.revokeObjectURL(link.href), 5000);
  appAlert(savedText || t('share.savedDownloads'));
  return true;
}
async function shareCompare(){
  const a = photos[+$('cmpA').value], b = photos[+$('cmpB').value];
  if(!a || !b) return;
  const [ia, ib] = await Promise.all([loadImg(a.img), loadImg(b.img)]);
  if(!ia || !ib){ appAlert(t('progress.preparePhotoFailed')); return; }
  const cs = getComputedStyle(document.body);
  const col = n => cs.getPropertyValue(n).trim();
  const W = 1080, H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  try{ await document.fonts.load('600 44px Oswald'); await document.fonts.load('500 38px Rubik'); }catch(e){}
  x.fillStyle = col('--bg'); x.fillRect(0, 0, W, H);
  x.textAlign = 'center';
  x.fillStyle = col('--muted'); x.font = '600 44px Oswald, sans-serif';
  x.fillText('F I T  /  T I M E R', W / 2, 110);
  x.fillStyle = col('--ink'); x.font = '500 46px Rubik, sans-serif';
  x.fillText(t('progress.myProgress'), W / 2, 190);
  // два фото
  const pw = 486, ph = 760, gy = 240;
  drawCover(x, ia, 34, gy, pw, ph, 26);
  drawCover(x, ib, W - 34 - pw, gy, pw, ph, 26);
  x.strokeStyle = col('--line'); x.lineWidth = 3;
  roundRect(x, 34, gy, pw, ph, 26); x.stroke();
  roundRect(x, W - 34 - pw, gy, pw, ph, 26); x.stroke();
  x.fillStyle = col('--muted'); x.font = '500 36px Rubik, sans-serif';
  x.fillText(fmtD(a.d), 34 + pw / 2, gy + ph + 58);
  x.fillText(fmtD(b.d), W - 34 - pw / 2, gy + ph + 58);
  const days = Math.abs(Math.round((new Date(b.d) - new Date(a.d)) / 86400000));
  x.fillStyle = col('--work'); x.font = '600 52px Oswald, sans-serif';
  x.fillText(days
    ? t('progress.daysWork',{count:days,days:appLocale === 'ru' ? plural(days,'ДЕНЬ','ДНЯ','ДНЕЙ') : (days === 1 ? 'DAY' : 'DAYS')})
    : t('progress.journeyStart'), W / 2, 1180);
  x.fillStyle = col('--muted'); x.font = '600 32px Oswald, sans-serif';
  x.fillText('F I T   T I M E R', W / 2, 1256);
  c.toBlob(async blob => {
    if(!blob){ appAlert(t('progress.imageFailed')); return; }
    await shareGeneratedFile(blob, 'fittimer-progress.png', t('progress.shareTitle'), t('progress.shareFallback'));
  }, 'image/png');
}

/* ================= ЭКСПОРТ / ИМПОРТ ВСЕХ ДАННЫХ ================= */
/* Что в резервную копию НЕ кладём, и почему именно это.

   Список исключений, а не список включений, — принципиально. Копия собиралась
   перечислением четырёх полей руками, и за ней не уследили: мимо прошли ручные
   правки веса (progWeights), режим тренера с его ником и ключом, вся картотека
   подопечных, пол с возрастом и — хуже всего — аккаунт с подпиской. Человек
   восстанавливался из копии и терял оплаченное, не узнав об этом.

   Теперь копия берёт ВСЁ, что перечислено в PROFILE_KEYS и GLOBAL_KEYS (те же
   списки, по которым идёт удаление — заводя ключ, его вписывают туда по 152-ФЗ),
   кроме вот этого: */
const NO_BACKUP = [
  // «прямо сейчас», а не данные: восстанавливать недоигранный подход из копии,
  // снятой месяц назад, — это вернуть человека в тренировку, которой не было
  'workoutSession',
  // служебное для обмена с сервером: восстановив очередь, телефон полезет
  // доотправлять то, чего на сервере уже нет
  'docMeta', 'outbox',
  // про устройство, а не про человека: два телефона с одним id — это два
  // телефона, притворяющиеся одним
  'deviceId'
];
const backupProfileKeys = () => PROFILE_KEYS.filter(k => !NO_BACKUP.includes(k));
const backupGlobalKeys  = () => GLOBAL_KEYS.filter(k => !NO_BACKUP.includes(k));

async function exportAllData(){
  const dump = {app: 'fittimer', version: 2, exportedAt: new Date().toISOString(),
                users, currentUser, data: {}, settings: {}};
  for(const u of users){
    // Складываем СЫРЫЕ строки, как они лежат в хранилище: копия не должна знать,
    // что внутри каждого ключа, — иначе она устареет вместе с первым же полем.
    const d = {};
    for(const k of backupProfileKeys()){
      const v = await kvGet(k + '_' + u.id);
      if(v != null) d[k] = v;
    }
    dump.data[u.id] = d;
  }
  for(const k of backupGlobalKeys()){
    const v = await kvGet(k);
    if(v != null) dump.settings[k] = v;
  }
  const blob = new Blob([JSON.stringify(dump, null, 1)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'fittimer-backup-' + localISO(new Date()) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  appAlert(t('backup.saved'));
}

async function importAllData(file){
  let dump;
  try{ dump = JSON.parse(await file.text()); }
  catch(e){ appAlert(t('backup.readFailed')); return; }
  if(!dump || dump.app !== 'fittimer' || !Array.isArray(dump.users)){
    appAlert(t('backup.invalid')); return;
  }
  if(!(await appConfirm(t('backup.replaceAll')))) return;

  /* Файл резервной копии — обычный JSON, и до сюда он мог доехать откуда угодно:
     его пересылают, правят в блокноте, собирают заново. Поэтому проходим по нему
     теми же пределами, что и по всему остальному. Раньше содержимое клалось в
     хранилище как есть, и имя профиля в мегабайт или строка вместо адреса
     фотографии приезжали прямо на экран. */
  const users = dump.users.filter(u => u && typeof u === 'object').slice(0, 20).map(u => {
    u.name = clampLine(u.name, NAME_MAX) || DEFAULT_NAME;
    u.photo = cleanPic(u.photo);
    if(u.gender && u.gender !== 'm' && u.gender !== 'f') u.gender = '';
    if(u.theme && !['system', 'light', 'dark'].includes(u.theme)) u.theme = 'system';
    return migrateUserAge(u);
  });
  if(!users.length){ appAlert(t('backup.noProfiles')); return; }

  await kvSet('users', JSON.stringify(users));
  await kvSet('currentUser', dump.currentUser || users[0].id);

  /* Копии первой версии складывали четыре поля разобранными объектами
     (programs/stats/photos/warmupAdded), вторая кладёт ВСЕ ключи сырыми строками.
     Читаем оба: файлы первой версии лежат у людей на диске, и ломать их задним
     числом значит отобрать у человека его же копию. */
  const OLD = {programs: 'customPrograms', stats: 'stats', photos: 'photos',
               warmupAdded: 'warmupAdded'};
  const raw = (v, k) => {
    if(v == null) return null;
    if(typeof v === 'string') return v;               // вторая версия
    if(k === 'warmupAdded') return v ? '1' : '0';     // первая: булево
    try{ return JSON.stringify(v); }catch(e){ return null; }
  };

  for(const [uid, d] of Object.entries(dump.data || {})){
    const got = {};
    for(const [oldName, key] of Object.entries(OLD)){
      if(d[oldName] !== undefined) got[key] = raw(d[oldName], oldName);
    }
    for(const k of backupProfileKeys()){
      if(d[k] !== undefined) got[k] = raw(d[k], k);
    }
    for(const [k, v] of Object.entries(got)){
      if(v == null) continue;
      await kvSet(k + '_' + uid, sanitizeBackupValue(k, v));
    }
  }
  for(const [k, v] of Object.entries(dump.settings || {})){
    // Кладём только известные ключи: файл не должен уметь завести в хранилище
    // то, чего приложение не заводит само.
    if(v == null || !backupGlobalKeys().includes(k)) continue;
    await kvSet(k, sanitizeBackupValue(k, raw(v, k)));
  }
  location.reload();
}

/* Значения из копии проходят те же пределы, что и всё пришедшее снаружи: файл
   пересылают, правят в блокноте, собирают заново. Чистим по смыслу ключа, а что
   не узнали — кладём как есть: это ключи, которые приложение пишет само, и трогать
   их содержимое здесь значило бы повторять их разбор во втором месте. */
function sanitizeBackupValue(key, str){
  const parse = () => { try{ return JSON.parse(str); }catch(e){ return null; } };
  if(key === 'customPrograms'){
    const list = parse();
    return JSON.stringify((Array.isArray(list) ? list : []).map(sanitizeProgram));
  }
  if(key === 'photos'){
    // Фото прогресса — те же data-адреса, что и у упражнений, и та же проверка.
    const list = parse();
    return JSON.stringify((Array.isArray(list) ? list : [])
      .map(ph => (ph && typeof ph === 'object' && cleanPic(ph.img)) ? {...ph, img: cleanPic(ph.img)} : null)
      .filter(Boolean));
  }
  if(key === 'trainer'){
    const t = parse() || {};
    t.name = clampLine(t.name, LIM.coachName);
    t.about = clampText(t.about, LIM.coachAbout);
    t.photo = cleanPic(t.photo) || '';
    t.links = cleanLink(t.links) || '';
    return JSON.stringify(t);
  }
  if(key === 'clients'){
    const list = parse();
    return JSON.stringify((Array.isArray(list) ? list : []).slice(0, 500).map(c => {
      if(!c || typeof c !== 'object') return null;
      c.name = clampLine(c.name, LIM.clientName);
      c.note = clampLine(c.note, LIM.clientNote);
      return c;
    }).filter(Boolean));
  }
  return str;
}

/* ================= КАРТИНКА ДЛЯ ШЕРИНГА =================
   Колонка полос, по полосе на метрику. Один и тот же код рисует и метрики тела,
   и самочувствие: отличаются они только набором полос.

   ВЫСОТА ХОЛСТА СЧИТАЕТСЯ ОТ ЧИСЛА ПОЛОС. С жиром и мышцами метрик тела стало
   шесть, а холст оставался 1080×1350: на полосу приходилось 150 точек, в которые
   не помещались ни шапка полосы, ни график под ней, — числа налезали на подписи,
   а линия выходила за подложку. Полоса теперь не меньше 210 точек, холст растёт
   вниз, а всё внутри полосы (отступы, кегли, поле графика) считается от её
   высоты, а не жёсткими числами: полоса любого размера остаётся читаемой.

   Подписи концов линии прижаты к полю графика: у точки под самым верхом подпись
   уходит ПОД неё, иначе она вылезала в шапку полосы. */
const SHARE_W = 1080, SHARE_TOP = 250, SHARE_BOT = 90, SHARE_GAP = 26, SHARE_LANE = 210;

async function sharePng(title, lanes, fname){
  const cs = getComputedStyle(document.body);
  // переменная темы может ссылаться на другую (--work: var(--accent)) — разворачиваем
  const col = n => {
    let v = cs.getPropertyValue(n).trim();
    for(let i = 0; i < 5 && /^var\(/.test(v); i++) v = cs.getPropertyValue(v.slice(4, -1).split(',')[0].trim()).trim();
    return v;
  };
  // «#RRGGBB» + прозрачность. Склейка «цвет + "44"» работала только с шестизначным
  // hex: на любом другом значении createLinearGradient().addColorStop() бросает
  // ошибку и обрывает всю отрисовку.
  const alpha = (c0, a) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c0).trim());
    return m ? `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})` : c0;
  };
  const num = v => new Intl.NumberFormat(localeTag(), {maximumFractionDigits:1}).format(Math.round(v * 10) / 10);

  // Полосу сначала подгоняем под привычные 1080×1350, потом зажимаем в границы
  // читаемости — и уже от неё считаем высоту холста. Так картинка с шестью
  // метриками растёт вниз, а с одной не превращается в полосу во весь экран.
  const n = Math.max(1, lanes.length);
  const W = SHARE_W;
  const fit = Math.floor((1350 - SHARE_TOP - SHARE_BOT - SHARE_GAP * (n - 1)) / n);
  const laneH = Math.max(SHARE_LANE, Math.min(320, fit));
  const H = SHARE_TOP + n * laneH + SHARE_GAP * (n - 1) + SHARE_BOT;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  try{
    await document.fonts.load('700 60px Oswald');
    await document.fonts.load('600 34px Oswald');
    await document.fonts.load('500 40px Rubik');
  }catch(e){}
  x.fillStyle = col('--bg'); x.fillRect(0, 0, W, H);
  x.textAlign = 'center';
  x.fillStyle = col('--muted'); x.font = '600 42px Oswald, sans-serif';
  x.fillText('F I T   T I M E R', W / 2, 100);
  x.fillStyle = col('--ink'); x.font = '500 54px Rubik, sans-serif';
  x.fillText(title, W / 2, 178);

  const gx = 70, gw = W - 140;
  // вся внутренняя вёрстка полосы — от её высоты
  const pad = Math.round(laneH * 0.11);
  const fsHead = Math.max(24, Math.min(34, Math.round(laneH * 0.17)));
  const fsVal = Math.max(22, Math.min(30, Math.round(laneH * 0.15)));
  let gy = SHARE_TOP;

  lanes.forEach(L => {
    const have = L.have;
    const pair = (L.have2 && L.have2.length === have.length) ? L.have2 : null;
    const color = col(L.v);
    const first = have[0], last = have[have.length - 1];
    const d = Math.round((last - first) * 10) / 10;
    // подложка
    x.fillStyle = col('--card'); x.strokeStyle = col('--line'); x.lineWidth = 2;
    roundRect(x, gx, gy, gw, laneH, 24); x.fill(); x.stroke();
    // шапка полосы: цветной кружок, название слева, изменение справа
    const headY = gy + pad + Math.round(fsHead * 0.85);
    x.fillStyle = color;
    x.beginPath(); x.arc(gx + 34, headY - Math.round(fsHead * 0.3), 11, 0, 7); x.fill();
    x.textAlign = 'left'; x.fillStyle = col('--ink'); x.font = `600 ${fsHead}px Oswald, sans-serif`;
    x.fillText(L.label, gx + 58, headY);
    x.textAlign = 'right';
    x.fillStyle = d < 0 ? col('--rest') : (d > 0 ? col('--work') : col('--muted'));
    x.font = `700 ${fsHead + 2}px Oswald, sans-serif`;
    const dTxt = d === 0 ? `${num(last)} ${L.unit}` : `${d > 0 ? '+' : '−'}${num(Math.abs(d))} ${L.unit}`;
    x.fillText(dTxt.trim(), gx + gw - 34, headY);

    // поле графика
    const plotX = gx + 40, plotW = gw - 80;
    const plotY = gy + pad + fsHead + Math.round(laneH * 0.07);
    const plotH = laneH - (plotY - gy) - pad;
    const all = pair ? have.concat(pair) : have;
    let min = Math.min(...all), max = Math.max(...all);
    const pd = Math.max((max - min) * 0.15, 0.5); min -= pd; max += pd;
    const span = Math.max(max - min, 1);
    const lx = i => plotX + plotW * (have.length === 1 ? .5 : i / (have.length - 1));
    const ly = v => plotY + plotH * (1 - (v - min) / span);
    // сетка
    x.strokeStyle = col('--line'); x.lineWidth = 1.5;
    for(let g = 0; g <= 2; g++){ const yy = plotY + plotH * g / 2; x.beginPath(); x.moveTo(plotX, yy); x.lineTo(plotX + plotW, yy); x.stroke(); }
    if(have.length > 1){
      // заливка
      const grad = x.createLinearGradient(0, plotY, 0, plotY + plotH);
      grad.addColorStop(0, alpha(color, .27)); grad.addColorStop(1, alpha(color, 0));
      x.beginPath(); x.moveTo(lx(0), ly(have[0]));
      have.forEach((v, i) => x.lineTo(lx(i), ly(v)));
      x.lineTo(lx(have.length - 1), plotY + plotH); x.lineTo(lx(0), plotY + plotH); x.closePath();
      x.fillStyle = grad; x.fill();
      // линия
      x.strokeStyle = color; x.lineWidth = 6; x.lineJoin = 'round'; x.lineCap = 'round';
      x.beginPath(); have.forEach((v, i) => i ? x.lineTo(lx(i), ly(v)) : x.moveTo(lx(i), ly(v))); x.stroke();
      // вторая половина одного числа (нижнее давление) — та же линия тоньше и бледнее
      if(pair){
        x.strokeStyle = alpha(color, .55); x.lineWidth = 4;
        x.beginPath(); pair.forEach((v, i) => i ? x.lineTo(lx(i), ly(v)) : x.moveTo(lx(i), ly(v))); x.stroke();
      }
    }
    x.fillStyle = color;
    x.beginPath(); x.arc(lx(0), ly(first), 9, 0, 7); x.fill();
    x.beginPath(); x.arc(lx(have.length - 1), ly(last), 11, 0, 7); x.fill();
    // подписи концов: у самого верха поля подпись уходит ПОД точку, иначе вылезет в шапку
    x.fillStyle = col('--ink'); x.font = `600 ${fsVal}px Oswald, sans-serif`;
    const mark = (i, v, v2, align) => {
      const py = ly(v);
      const yy = (py - 20 < plotY + fsVal) ? py + fsVal + 10 : py - 20;
      x.textAlign = align;
      x.fillText(pair ? `${num(v)}/${num(v2)}` : num(v), lx(i), Math.min(yy, plotY + plotH));
    };
    mark(0, first, pair ? pair[0] : 0, 'left');
    if(have.length > 1) mark(have.length - 1, last, pair ? pair[pair.length - 1] : 0, 'right');

    gy += laneH + SHARE_GAP;
  });

  x.textAlign = 'center';
  x.fillStyle = col('--muted'); x.font = '600 30px Oswald, sans-serif';
  x.fillText('F I T   T I M E R', W / 2, H - 44);

  c.toBlob(async blob => {
    if(!blob){ appAlert(t('progress.imageFailed')); return; }
    await shareGeneratedFile(blob, fname, title + ' — Fit Timer', t('progress.shareSaved'));
  }, 'image/png');
  return c;
}

// полосы метрик тела: тот же порядок, что в карточке «Вес и объёмы»
function shareBodyLanes(){
  const ws = stats.weights || [];
  const defs = [
    {k:'w',v:'--work',label:t('progress.bodyWeight'),unit:t('progress.kg')},
    {k:'fat',v:'--danger',label:t('progress.bodyFat'),unit:'%'},
    {k:'musc',v:'--ok',label:t('progress.bodyMuscle'),unit:'%'},
    {k:'waist',v:'--accent-ink',label:t('progress.waist'),unit:t('progress.cm')},
    {k:'hips',v:'--rest-ink',label:t('progress.hips'),unit:t('progress.cm')},
    {k:'chest',v:'--warn',label:t('progress.chest'),unit:t('progress.cm')}
  ];
  return defs.map(item => {
    item.have = ws.map(p => p[item.k]).filter(v => v != null).slice(-30);
    return item;
  }).filter(L => L.have.length);
}

// полосы самочувствия: давление идёт парой линий — верхнее ведёт, нижнее следом
function shareWellLanes(){
  const ws = wellList();
  const defs = [
    {k:'sys',pair:'dia',v:'--danger',label:t('progress.pressure'),unit:''},
    {k:'pulse',v:'--accent-ink',label:t('progress.pulse'),unit:t('progress.bpm')},
    {k:'sleep',v:'--rest-ink',label:t('progress.sleep'),unit:t('progress.hoursShort')}
  ];
  return defs.map(item => {
    const pts = ws.filter(p => p[item.k] != null).slice(-30);
    item.have = pts.map(p => p[item.k]);
    item.have2 = (item.pair && pts.length && pts.every(p => p[item.pair] != null)) ? pts.map(p => p[item.pair]) : null;
    return item;
  }).filter(L => L.have.length);
}

async function shareWeightChart(){
  const lanes = shareBodyLanes();
  if(!lanes.length){ appAlert(t('progress.addMetricFirst')); return; }
  await sharePng(t('progress.myChanges'), lanes, 'fittimer-progress.png');
}

async function shareWellChart(){
  const lanes = shareWellLanes();
  if(!lanes.length){ appAlert(t('progress.addWellnessFirst')); return; }
  await sharePng(t('progress.myWellness'), lanes, 'fittimer-wellness.png');
}

/* ================= ИСТОРИЯ ВЕСА (правка задним числом) ================= */
function openWeightHist(){
  const list = $('whList'); list.innerHTML = '';
  const entries = stats.weights.slice(-30).reverse();
  entries.forEach(en => {
    const row = document.createElement('div');
    row.className = 'wh-row';
    const [y, m, d] = en.d.split('-');
    const cell = (k, lbl, v, st) => `<div class="whc"><label>${lbl}</label><input type="number" step="${st || 0.5}" inputmode="decimal" value="${v || ''}" data-k="${k}"></div>`;
    row.innerHTML =
      `<div class="wh-top"><b>${+d} ${MONTH_OF[+m - 1]} ${y}</b>` +
      `<button type="button" class="wh-del" title="${esc(t('progress.deleteEntry'))}">${icon('trash')}</button></div>` +
      `<div class="wh-cells">` +
        `<div class="whc"><label>${esc(t('common.weight'))}</label><input type="number" step="0.1" inputmode="decimal" value="${en.w}" data-d="${en.d}" data-k="w"></div>` +
        cell('fat', t('progress.fat'), en.fat, 0.1) + cell('musc', t('progress.muscle'), en.musc, 0.1) +
        cell('waist', t('progress.waistLabel'), en.waist) + cell('hips', t('progress.hipsLabel'), en.hips) + cell('chest', t('progress.chestLabel'), en.chest) +
      `</div>`;
    row.querySelector('.wh-del').onclick = ()=> row.classList.toggle('del');
    list.appendChild(row);
  });
  $('whModal').classList.add('open');
}
async function saveWeightHist(){
  const rows = [...$('whList').querySelectorAll('.wh-row')];
  for(const row of rows){
    const wInp = row.querySelector('input[data-k=w]');
    const d = wInp.dataset.d;
    const i = stats.weights.findIndex(e => e.d === d);
    if(i < 0) continue;
    if(row.classList.contains('del')){
      stats.weights.splice(i, 1);
      continue;
    }
    const en = stats.weights[i];
    const w = parseFloat(String(wInp.value).replace(',', '.'));
    if(w && w >= 20 && w <= 300) en.w = w;
    // у обхватов и процентов разные границы: 18 % жира — нормальная цифра, 18 см талии — нет
    const lim = {waist: [30, 200], hips: [30, 200], chest: [30, 200], fat: [3, 70], musc: [10, 80]};
    for(const k of Object.keys(lim)){
      const v = parseFloat(String(row.querySelector(`input[data-k=${k}]`).value).replace(',', '.'));
      if(v && v >= lim[k][0] && v <= lim[k][1]) en[k] = Math.round(v * 10) / 10; else delete en[k];
    }
  }
  stats.weights.sort((a, b) => a.d < b.d ? -1 : 1);
  await saveStats();
  $('whModal').classList.remove('open');
  renderWeight();
}

/* ================= ПЕРВЫЙ ЗАПУСК (ОНБОРДИНГ) ================= */
/* ================= ПРЕДЕЛЫ ПОЛЕЙ =================

   Одно место на всё приложение, и это не вкусовщина: длина поля решается дважды —
   когда человек печатает и когда ТО ЖЕ САМОЕ приезжает снаружи. Снаружи приезжает
   много: программа по ссылке от тренера, программа из каталога, файл программы,
   код FIT1, резервная копия. Там `maxlength` не действует, и ровно там встречается
   и миллион символов, и кавычка посреди адреса картинки.

   Поэтому правило одно, а применяется в трёх местах: атрибут в разметке (чтобы
   нельзя было напечатать), обрезка при сохранении (чтобы нельзя было вставить) и
   разбор всего, что пришло снаружи (`sanitizeProgram`).

   Числа взяты не с потолка: столько помещается там, где поле показывают. Имя
   программы — в карточку, «о себе» — на страницу тренера, описание упражнения —
   в свёрнутый блок на экране упражнения. */
const LIM = {
  progName: 60, progDesc: 1000,
  exName: 60, exDesc: 600, exMistakes: 300, exSwapName: 60, exSwapDesc: 600,
  exValue: 16,               // «12-15», «01:30» — больше там быть нечему
  link: 120, video: 300,
  userName: 20, clientName: 40, clientNote: 80,
  coachName: 40, coachAbout: 400, coachHandle: 30,
  gives: 300, note: 500, wish: 600,
  aiAnswer: 80000,           // ответ нейросети — это целая программа, он правда длинный
  pic: 900 * 1024            // картинка в строке base64
};

/* Управляющие символы из текста убираем ВСЕГДА. Перевод строки и табуляция —
   это текст, остальное — нет: невидимые символы ломают разметку, сортировку и
   поиск, а человек их не видит и не может убрать. */
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\uFEFF]/g;
// Разделители строк из юникода — это ПЕРЕНОС, а не мусор: выбросив их молча,
// склеишь два слова в одно («…ния» + «тут» → «ниятут»). Сводим к обычному \n,
// а дальше с ним поступают по правилам поля.
const NL = /[\u2028\u2029\r]/g;

// Многострочный текст: описания, заметки, «о себе».
function clampText(v, max){
  return String(v == null ? '' : v).replace(NL, '\n').replace(CTRL, '').trim().slice(0, max);
}
// Однострочный: имена, названия. Перенос строки в названии программы — это
// две строки в карточке там, где место под одну.
function clampLine(v, max){
  return String(v == null ? '' : v).replace(NL, '\n').replace(CTRL, '')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}
const clampNum = (v, min, max, dflt) => {
  const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  if(!isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
};

/* Картинка. Всё, что мы показываем через <img src>, обязано быть data-адресом
   картинки и ничем другим. Чужая программа приносит это поле как обычную строку,
   и строка вида  x" onerror="…  превращается в чужой код на экране: браузер
   читает атрибут, а не наше намерение. Проверяем ФОРМУ, а не доверяем источнику. */
const PIC_RE = /^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/]+=*$/;
function cleanPic(v){
  const s = String(v == null ? '' : v).trim();
  return (s.length <= LIM.pic && PIC_RE.test(s)) ? s : null;
}

/* Ссылка на себя. «Где меня найти» — это адрес, а не слово: «хуй» в этом поле
   уезжает на страницу тренера и делается ссылкой https://хуй, по которой человек
   нажимает и попадает в никуда. Поэтому требуем то, что вообще может быть адресом:
   имя узла с точкой. Схему дописываем сами — её не набирают.

   Возвращает нормализованный адрес или null. Ругаться и объяснять — дело того,
   кто вызвал: в одном месте это надпись под полем, в другом молчаливый пропуск. */
const HOST_RE = /^[a-zа-яё0-9]([a-zа-яё0-9-]*[a-zа-яё0-9])?(\.[a-zа-яё0-9-]+)+$/i;
function cleanLink(v, max){
  let s = clampLine(v, max || LIM.link);
  if(!s) return '';
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, m => /^https?:\/\//i.test(m) ? m : '');
  // Схемы вроде javascript: и data: не начинаются с //, поэтому их ловим отдельно.
  if(/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) return null;
  const bare = s.replace(/^https?:\/\//i, '');
  const host = bare.split(/[/?#]/)[0];
  if(!HOST_RE.test(host)) return null;
  return /^https?:\/\//i.test(s) ? s : 'https://' + s;
}

/* Всё, что приехало снаружи, чистится ОДНОЙ функцией: программа по ссылке, из
   каталога, из файла, из кода FIT1 и из резервной копии проходят один и тот же
   путь. Разводить их по местам нельзя — каждый забытый путь и есть дыра. */
function sanitizeProgram(p){
  if(!p || typeof p !== 'object') return p;
  p.name = clampLine(p.name, LIM.progName) || t('program.default');
  if(p.desc != null) p.desc = clampText(p.desc, LIM.progDesc);
  p.cover = cleanPic(p.cover);
  if(p.by != null) p.by = clampLine(p.by, 40);
  if(p.byLink != null) p.byLink = cleanLink(p.byLink) || '';
  (Array.isArray(p.plans) ? p.plans : []).forEach(pl => {
    if(!pl || typeof pl !== 'object') return;
    (Array.isArray(pl.exercises) ? pl.exercises : []).forEach(sanitizeExercise);
  });
  (Array.isArray(p.exercises) ? p.exercises : []).forEach(sanitizeExercise);
  return p;
}
function sanitizeExercise(ex){
  if(!ex || typeof ex !== 'object') return;
  ex.name = clampLine(ex.name, LIM.exName);
  if(ex.desc != null)     ex.desc = clampText(ex.desc, LIM.exDesc);
  if(ex.mistakes != null) ex.mistakes = clampText(ex.mistakes, LIM.exMistakes);
  if(ex.swapName != null) ex.swapName = clampLine(ex.swapName, LIM.exSwapName);
  if(ex.swapDesc != null) ex.swapDesc = clampText(ex.swapDesc, LIM.exSwapDesc);
  if(ex.video != null)    ex.video = cleanLink(ex.video, LIM.video) || '';
  if(ex.value != null && typeof ex.value === 'string') ex.value = clampLine(ex.value, LIM.exValue);
  const pic = ex.media && ex.media.kind === 'img' ? cleanPic(ex.media.data) : null;
  ex.media = pic ? {kind: 'img', data: pic} : null;
}

// Имя профиля. На старте его не спрашивают, но называться профиль как-то должен.
// «Гость» здесь не годится: гость — это чужой и ненадолго, а человек у себя дома
// и надолго. Имя профиля, в отличие от аккаунта, ничего не адресует — уникальность
// ему не нужна, поэтому первый профиль просто «Мой профиль», а следующие нумеруются,
// чтобы их можно было различить в списке.
const NAME_MAX = 20;   // длиннее не помещается ни в приветствие, ни в строку профиля
const DEFAULT_NAME = 'Мой профиль';
function nextProfileName(){
  if(!users.some(u => (u.name || '').trim() === DEFAULT_NAME)) return DEFAULT_NAME;
  let n = 1;
  users.forEach(u => {
    const m = /^Профиль\s+(\d+)$/.exec((u.name || '').trim());
    if(m) n = Math.max(n, +m[1]);
  });
  return t('profile.defaultNumber',{count:n+1});
}

function startOnboarding(){
  // Тема первого запуска — системная. Раньше здесь жёстко включалась светлая, и на
  // тёмном телефоне знакомство начиналось с белой вспышки во весь экран. Дальше
  // человек всё равно переключит её в настройках, а первое впечатление уже испорчено.
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  themeLight = !dark;
  applyTheme();
  show('scrOnboard', false);
}

// Профиль заводится по нажатию любой кнопки знакомства — и там же фиксируется согласие
// с правилами, о котором написано под кнопками.
async function finishOnboardingCreate(){
  if(users.length) return;
  const u = {
    id: 'u' + Date.now(),
    name: nextProfileName(),
    gender: '', age: null, photo: null,
    theme: 'system'
  };
  users = [u];
  await saveUsers();
  currentUser = u.id;
  kvSet('currentUser', u.id);
  await loadIdentity();
  recordConsent('terms');
  await loadData();
  await loadPhotos();
  await ensureWarmup();
  renderUsers(); renderMine(); renderStats(); renderWeight(); renderWellness(); renderPhotos();
  applyTheme();
}

/* ---- пол и возраст: спрашиваем по требованию ---- */
// Оба поля обязательны. Пол по умолчанию не выбран вовсе: подставленный «женский»
// уходил в запрос к ИИ как настоящий ответ, и половина программ составлялась не для
// того человека. Пропустить вопрос нельзя — «Отмена» возвращает туда, откуда пришли.
const WHO_MSG = {
  program: 'Чтобы правильно подобрать упражнения, нагрузку и время на восстановление, нужны пол и возраст. Спросим один раз — дальше это меняется в профиле.',
  ai: 'Нейросети нужно знать, для кого составлять программу: от пола и возраста зависят и упражнения, и нагрузка, и восстановление.'
};
let whoDraft = null, whoDone = null;
const needWho = u => !!u && (!profileAge(u) || !u.gender);
function whoSyncForm(){
  $('whoF').classList.toggle('act', whoDraft.gender === 'f');
  $('whoM').classList.toggle('act', whoDraft.gender === 'm');
  $('whoSave').disabled = !whoDraft.gender || !!ageError($('whoAge').value || '', true);
}
function askWho(reason){
  const u = curUser();
  if(!u) return Promise.resolve(false);
  whoDraft = {gender: u.gender || ''};
  $('whoMsg').textContent = WHO_MSG[reason] || WHO_MSG.program;
  $('whoAge').value = profileAge(u) || '';
  whoSyncForm();
  $('whoModal').classList.add('open');
  return new Promise(res => { whoDone = res; });
}
// Экран, которому эти данные нужны, уже открыт: попап видно поверх него. Если человек
// отказался отвечать — уводим обратно, а не оставляем его на экране, который без
// ответа всё равно не сработает.
function requireWho(reason, onCancel){
  const u = curUser();
  if(!u || !needWho(u)) return;
  askWho(reason).then(ok => { if(!ok && onCancel) onCancel(); });
}
async function whoFinish(save){
  const u = curUser();
  if(!u){ $('whoModal').classList.remove('open'); return; }
  if(save){
    const age = $('whoAge').value || '';
    const err = ageError(age, true);
    if(err){ appAlert(err); return; }
    if(!whoDraft.gender){ appAlert(t('profile.genderNeeded')); return; }
    u.gender = whoDraft.gender;
    u.age = validAge(age);
    await saveUsers();
    renderUsers();
  }
  $('whoModal').classList.remove('open');
  if(whoDone){ whoDone(!!save); whoDone = null; }
}

