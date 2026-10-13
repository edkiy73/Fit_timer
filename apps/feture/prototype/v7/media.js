/* ============ V7 MEDIA: batch upload (≤6, auto-compression, metadata removal, progress, crop) + full-screen viewer ============ */
const MEDIA_MAX=6;
const ASPECTS={'4:5':[4,5],'1:1':[1,1],'16:9':[16,9],orig:null};
const kb=n=>n>=1048576?(n/1048576).toFixed(1).replace('.',S.lang==='en'?'.':',')+L(' МБ',' MB'):Math.max(1,Math.round(n/1024))+L(' КБ',' KB');

/** Decode → downscale to 2048px → re-encode. Re-encoding through a canvas drops EXIF/GPS/camera metadata. */
async function decodeImage(src){
 const img=new Image();img.decoding='async';img.src=src;await img.decode();return img;
}
/** WebP where the browser can encode it (Android/Chrome), JPEG otherwise (iOS Safari) — both carry no EXIF */
async function encodeCanvas(c,q=.84){const webp=await new Promise(res=>c.toBlob(b=>res(b),'image/webp',q));if(webp&&webp.type==='image/webp')return webp;return new Promise(res=>c.toBlob(b=>res(b),'image/jpeg',q));}
async function compressImage(file){
 const src=URL.createObjectURL(file);
 try{const img=await decodeImage(src);const k=Math.min(1,2048/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  const blob=await encodeCanvas(c);const url=URL.createObjectURL(blob);localMediaURLs.add(url);return{url,w:c.width,h:c.height,size:blob.size};}
 finally{URL.revokeObjectURL(src);}
}
async function cropImage(item,aspect){
 const img=await decodeImage(item.full||item.url);const cr=item.crop;const [aw,ah]=ASPECTS[aspect];
 // the visible frame covers (fw × fh) source pixels starting at (sx, sy)
 const base=Math.max(aw/img.naturalWidth,ah/img.naturalHeight);const scale=base*cr.z;const fw=aw/scale,fh=ah/scale;
 const sx=Math.max(0,Math.min(img.naturalWidth-fw,(img.naturalWidth-fw)/2-cr.x*img.naturalWidth));const sy=Math.max(0,Math.min(img.naturalHeight-fh,(img.naturalHeight-fh)/2-cr.y*img.naturalHeight));
 const outW=Math.min(1440,Math.round(fw));const outH=Math.round(outW*ah/aw);
 const c=document.createElement('canvas');c.width=outW;c.height=outH;c.getContext('2d').drawImage(img,sx,sy,fw,fh,0,0,outW,outH);
 const blob=await encodeCanvas(c,.86);const url=URL.createObjectURL(blob);localMediaURLs.add(url);return{url,size:blob.size,w:outW,h:outH};
}
function videoMeta(url){return new Promise(res=>{const v=document.createElement('video');v.preload='metadata';v.muted=true;v.onloadedmetadata=()=>res({dur:v.duration||0,w:v.videoWidth,h:v.videoHeight});v.onerror=()=>res({dur:0});v.src=url;});}
const fmtDur=s=>`${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`;

/**
 * Open the uploader. o = {max, accept:'image'|'media', aspect:'4:5'|'1:1'|'16:9'|null, aspects:[...], title, have, done(items)}
 * Items: {type:'image'|'video', url, size, w, h, dur?}
 */
function openUploader(o){
 const left=Math.max(0,(o.max||MEDIA_MAX)-(o.have||0));
 if(!left){toast(L(`Уже ${o.max||MEDIA_MAX} из ${o.max||MEDIA_MAX} — убери что-нибудь, чтобы добавить новое`,`Already ${o.max||MEDIA_MAX} of ${o.max||MEDIA_MAX} — remove one to add another`),{type:'warn'});return;}
 const input=document.createElement('input');input.type='file';input.multiple=left>1;input.accept=o.accept==='image'?'image/*':'image/*,video/*';input.hidden=true;document.body.append(input);
 input.addEventListener('change',()=>{const files=[...input.files];input.remove();if(files.length)startUpload(o,files,left);},{once:true});
 input.addEventListener('cancel',()=>input.remove(),{once:true});
 input.click();
}
function startUpload(o,files,left){
 const owner=S,route=cur();
 if(files.length>left)toast(L(`Можно добавить ещё ${left}. Остальные файлы пропустили`,`You can add ${left} more. The rest were skipped`),{type:'warn'});
 const items=[];
 for(const f of files.slice(0,left)){
  const video=f.type.startsWith('video/'),image=f.type.startsWith('image/');
  if(!image&&!(video&&o.accept!=='image')){toast(L(`«${f.name}» — не фото и не видео`,`“${f.name}” isn’t a photo or video`),{type:'warn'});continue;}
  if(f.size>(video?200:25)*1048576){toast(video?L('Видео — до 200 МБ','Videos up to 200 MB'):L('Фото — до 25 МБ','Photos up to 25 MB'),{type:'warn'});continue;}
  items.push({id:'u'+Math.random().toString(36).slice(2,8),file:f,type:video?'video':'image',name:f.name,orig:f.size,status:'prep',progress:0,crop:{x:0,y:0,z:1}});
 }
 if(!items.length)return;
 S.ui.up={o,items,aspect:o.aspect||null,owner,route};
 sheet(uploaderSheet,{full:true,onClose:()=>{if(S.ui.up&&!S.ui.up.finished)S.ui.up.cancelled=true;}});
 items.forEach(it=>processItem(it));
}
async function processItem(it){
 const up=S.ui.up;if(!up)return;
 try{
  if(it.type==='image'){const r=await compressImage(it.file);Object.assign(it,{url:r.url,full:r.url,size:r.size,w:r.w,h:r.h});if(up.aspect){const c=await cropImage(it,up.aspect);Object.assign(it,{url:c.url,size:c.size,w:c.w,h:c.h});}}
  else{const url=URL.createObjectURL(it.file);localMediaURLs.add(url);const m=await videoMeta(url);Object.assign(it,{url,size:it.orig,dur:m.dur,w:m.w,h:m.h});if(m.dur>180){it.status='error';it.err=L('Видео длиннее 3 минут','Video is longer than 3 minutes');upRefresh();return;}}
 }catch(e){it.status='error';it.err=L('Не получилось прочитать файл. Подойдут JPG, PNG, WEBP, HEIC с iPhone или MP4','Couldn’t read the file. JPG, PNG, WEBP, iPhone HEIC or MP4 work');upRefresh();return;}
 it.status='up';upRefresh();uploadTick(it);
}
/** simulated network upload with honest failure (QA offline toggle) */
function uploadTick(it){const up=S.ui.up;if(!up||up.cancelled||!up.items.includes(it))return;
 if(QA.offline){it.status='error';it.err=L('Нет соединения — файл не загружен','No connection — not uploaded');upRefresh();return;}
 it.progress=Math.min(100,it.progress+(it.type==='video'?6:14)+Math.random()*8);
 const row=$(`[data-up="${it.id}"]`);if(row){$('.upbar i',row).style.width=it.progress+'%';$('.upst',row).textContent=upStatus(it);}
 if(it.progress>=100){it.status='ok';upRefresh();return;}
 setTimeout(()=>uploadTick(it),QA.reduced?20:140);
}
function upStatus(it){
 if(it.status==='prep')return it.type==='image'?L('Сжимаем и убираем метаданные…','Compressing and removing metadata…'):L('Готовим видео…','Preparing video…');
 if(it.status==='error')return it.err;
 if(it.status==='up')return L(`Загрузка ${Math.round(it.progress)}%`,`Uploading ${Math.round(it.progress)}%`);
 return it.type==='image'?(it.size<it.orig*.95?L(`Готово · ${kb(it.orig)} → ${kb(it.size)} · без геометки и данных камеры`,`Done · ${kb(it.orig)} → ${kb(it.size)} · no location or camera data`):L(`Готово · ${kb(it.size)} · без геометки и данных камеры`,`Done · ${kb(it.size)} · no location or camera data`)):L(`Готово · ${fmtDur(it.dur||0)} · метаданные уберём на сервере`,`Done · ${fmtDur(it.dur||0)} · metadata removed on the server`);
}
const upRefresh=()=>{if(S.ui.up&&S.ui.sheet?.build===uploaderSheet)resheet();};
function uploaderSheet(){const up=S.ui.up,o=up.o;const ready=up.items.filter(i=>i.status==='ok').length,busy=up.items.some(i=>i.status==='prep'||i.status==='up');
 const asp=o.aspects&&o.aspects.length>1?`<div class="sec" style="margin-top:4px">${L('Формат','Format')}</div>${seg(o.aspects.map(a=>[a,a==='orig'?L('Как есть','Original'):a]),up.aspect||'orig','upAspect','sm')}`:'';
 return{title:o.title||L('Загрузка','Upload'),body:`${asp}<div class="uplist">${up.items.map((it,i)=>`<div class="uprow ${it.status}" data-up="${it.id}">
  <button class="upthumb" ${it.url?`data-act="upView" data-v="${i}"`:'disabled'} aria-label="${L('Посмотреть','View')}">${it.url?(it.type==='video'?`<video src="${esc(it.url)}" muted playsinline preload="metadata"></video><span class="dur">${I.video}${fmtDur(it.dur||0)}</span>`:`<img src="${esc(it.url)}" alt="">`):`<span class="sk" style="position:absolute;inset:0;border-radius:0"></span>`}</button>
  <div class="tx"><b>${esc(it.name)}</b><small class="upst">${upStatus(it)}</small><div class="upbar"><i style="width:${it.status==='ok'?100:it.progress}%"></i></div>
   <div class="upacts">${it.type==='image'&&it.full&&up.aspect?`<button class="btn text auto" data-act="upCrop" data-v="${i}">${ic('edit',15)}${L('Кадрировать','Crop')}</button>`:''}${it.status==='error'&&it.url?`<button class="btn text auto" data-act="upRetry" data-v="${i}">${L('Повторить','Retry')}</button>`:''}<button class="btn text auto danger" data-act="upRm" data-v="${i}">${L('Убрать','Remove')}</button></div></div></div>`).join('')}</div>
  ${up.items.length<(o.max||MEDIA_MAX)-(o.have||0)?`<button class="btn soft mt12" data-act="upMore">${I.plus}${L('Добавить ещё','Add more')} · ${up.items.length+(o.have||0)}/${o.max||MEDIA_MAX}</button>`:''}
  <div class="alert mt12">${I.shield}<span>${L('Фото сжимаем прямо на телефоне и стираем скрытые данные: геометку, модель камеры, дату съёмки. Лица других людей — только с их согласия.','Photos are compressed on your phone and hidden data is wiped: location, camera model, capture date. Other people’s faces only with their consent.')}</span></div>`,
 foot:`<button class="btn primary ${ready&&!busy?'':'off'}" data-act="upDone">${busy?L('Загружаем…','Uploading…'):ready?L(`Готово · ${pl(ready,['файл','файла','файлов'],['file','files'])}`,`Done · ${pl(ready,[],['file','files'])}`):L('Нечего добавить','Nothing to add')}</button>`};}
ACT.upAspect=async a=>{const up=S.ui.up;up.aspect=a.dataset.v==='orig'?null:a.dataset.v;for(const it of up.items.filter(i=>i.type==='image'&&i.full)){it.crop={x:0,y:0,z:1};if(up.aspect){const c=await cropImage(it,up.aspect);Object.assign(it,{url:c.url,size:c.size,w:c.w,h:c.h});}else Object.assign(it,{url:it.full});}upRefresh();};
ACT.upRm=a=>{const up=S.ui.up;up.items.splice(+a.dataset.v,1);if(!up.items.length){closeSheet();return;}upRefresh();};
ACT.upRetry=a=>{const it=S.ui.up.items[+a.dataset.v];it.status='up';it.progress=0;upRefresh();uploadTick(it);};
ACT.upMore=()=>{const up=S.ui.up;const left=(up.o.max||MEDIA_MAX)-(up.o.have||0)-up.items.length;const input=document.createElement('input');input.type='file';input.multiple=true;input.accept=up.o.accept==='image'?'image/*':'image/*,video/*';input.hidden=true;document.body.append(input);
 input.addEventListener('change',()=>{const files=[...input.files].slice(0,left);input.remove();for(const f of files){const video=f.type.startsWith('video/');if(!f.type.startsWith('image/')&&!(video&&up.o.accept!=='image'))continue;const it={id:'u'+Math.random().toString(36).slice(2,8),file:f,type:video?'video':'image',name:f.name,orig:f.size,status:'prep',progress:0,crop:{x:0,y:0,z:1}};up.items.push(it);processItem(it);}upRefresh();},{once:true});input.click();};
ACT.upView=a=>{const up=S.ui.up;openViewer(up.items.filter(i=>i.url).map(i=>({type:i.type,src:i.url})),+a.dataset.v);};
ACT.upDone=()=>{const up=S.ui.up;if(!up||up.items.some(i=>i.status==='prep'||i.status==='up'))return;const ok=up.items.filter(i=>i.status==='ok').map(i=>({type:i.type,url:i.url,size:i.size,w:i.w,h:i.h,dur:i.dur}));up.finished=true;closeSheet();S.ui.up=null;
 if(S!==up.owner||cur()!==up.route)return;if(ok.length){up.o.done(ok);toast(L(`Добавлено: ${ok.length}`,`Added: ${ok.length}`),{type:'ok'});}};

/* ---------- crop editor: drag to move, pinch / slider to zoom ---------- */
ACT.upCrop=a=>{const up=S.ui.up;const it=up.items[+a.dataset.v];openCrop(it.full,up.aspect,it.crop,async crop=>{it.crop=crop;const c=await cropImage(it,up.aspect);Object.assign(it,{url:c.url,size:c.size,w:c.w,h:c.h});S.ui.up=up;sheet(uploaderSheet,{full:true});});};
function openCrop(src,aspect,crop,done){
 const [aw,ah]=ASPECTS[aspect];const st={x:crop.x,y:crop.y,z:crop.z};const prevUp=S.ui.up;
 sheet(()=>({title:L('Кадрирование','Crop'),body:`<div class="crop" style="aspect-ratio:${aw}/${ah}" id="cropBox"><img src="${esc(src)}" alt="" draggable="false" id="cropImg"><div class="crop-grid"><i></i><i></i><i></i><i></i></div></div>
  <label class="crop-zoom">${ic('search',16)}<input type="range" min="1" max="3" step="0.01" value="${st.z}" id="cropZ" aria-label="${L('Масштаб','Zoom')}"></label><p class="note center">${L(`Формат ${aspect} — одинаковый для всех фото, поэтому лента и профиль выглядят ровно. Двигай фото пальцем.`,`${aspect} format is the same for every photo, so the feed and profile look tidy. Drag the photo to move it.`)}</p>`,
  foot:`<div class="row g8"><button class="btn soft" style="flex:0 0 auto;width:auto" data-act="cropReset">${L('Сбросить','Reset')}</button><button class="btn primary" data-act="cropOk">${L('Применить','Apply')}</button></div>`}),{full:true,onClose:()=>{if(!S.ui.cropDone&&prevUp){S.ui.up=prevUp;setTimeout(()=>{if(!S.ui.sheet)sheet(uploaderSheet,{full:true});},300);}S.ui.cropDone=false;}});
 S.ui.crop={st,done,aspect};
 requestAnimationFrame(()=>{const box=$('#cropBox'),img=$('#cropImg'),z=$('#cropZ');if(!box)return;
  const apply=()=>{const bw=box.clientWidth,bh=box.clientHeight;const nw=img.naturalWidth||1,nh=img.naturalHeight||1;const base=Math.max(bw/nw,bh/nh);const w=nw*base*st.z,h=nh*base*st.z;
   const mx=(w-bw)/2/w,my=(h-bh)/2/h;st.x=Math.max(-mx,Math.min(mx,st.x));st.y=Math.max(-my,Math.min(my,st.y));
   img.style.width=w+'px';img.style.height=h+'px';img.style.transform=`translate(${(bw-w)/2+st.x*w}px,${(bh-h)/2+st.y*h}px)`;};
  if(img.complete)apply();else img.onload=apply;z.oninput=()=>{st.z=+z.value;apply();};
  const pts=new Map();let last=null,pinch=null;
  box.addEventListener('pointerdown',e=>{box.setPointerCapture(e.pointerId);pts.set(e.pointerId,[e.clientX,e.clientY]);last=[e.clientX,e.clientY];if(pts.size===2){const [a,b]=[...pts.values()];pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1]),z:st.z};}});
  box.addEventListener('pointermove',e=>{if(!pts.has(e.pointerId))return;pts.set(e.pointerId,[e.clientX,e.clientY]);
   if(pts.size===2&&pinch){const [a,b]=[...pts.values()];st.z=Math.max(1,Math.min(3,pinch.z*Math.hypot(a[0]-b[0],a[1]-b[1])/pinch.d));z.value=st.z;apply();return;}
   const w=img.offsetWidth,h=img.offsetHeight;st.x+=(e.clientX-last[0])/w;st.y+=(e.clientY-last[1])/h;last=[e.clientX,e.clientY];apply();});
  const up=e=>{pts.delete(e.pointerId);if(pts.size<2)pinch=null;const r=[...pts.values()][0];if(r)last=r;};
  box.addEventListener('pointerup',up);box.addEventListener('pointercancel',up);
  box.addEventListener('wheel',e=>{e.preventDefault();st.z=Math.max(1,Math.min(3,st.z-e.deltaY*.002));z.value=st.z;apply();},{passive:false});
  S.ui.crop.apply=apply;});
}
ACT.cropReset=()=>{const c=S.ui.crop;Object.assign(c.st,{x:0,y:0,z:1});$('#cropZ').value=1;c.apply&&c.apply();};
ACT.cropOk=()=>{const c=S.ui.crop;S.ui.cropDone=true;closeSheet(true);c.done({...c.st});};

/* ---------- full-screen viewer for photos and videos ---------- */
let VW=null;
function openViewer(items,index=0){
 items=(items||[]).filter(Boolean);if(!items.length)return;
 const el=$('#viewer')||Object.assign(document.createElement('div'),{id:'viewer',className:'viewer'});if(!el.isConnected)$('#layer').append(el);
 VW={items,i:Math.max(0,Math.min(items.length-1,index)),opener:document.activeElement};
 el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label',L('Просмотр','Viewer'));
 el.innerHTML=`<div class="vw-track" id="vwTrack">${items.map(m=>`<figure>${m.type==='video'?`<video src="${esc(m.src)}" controls playsinline preload="metadata"></video>`:m.type==='plate'?`<div class="vw-plate">${plate(m.key)}</div>`:`<img src="${esc(m.src)}" alt="" draggable="false" style="${m.style||''}">`}</figure>`).join('')}</div>
 <div class="vw-top"><span class="vw-n" id="vwN"></span><button class="ibtn glass" data-act="vwClose" aria-label="${L('Закрыть','Close')}">${I.close}</button></div>
 ${items.length>1?`<button class="vw-nav l" data-act="vwStep" data-v="-1" aria-label="${L('Предыдущее','Previous')}">${I.back}</button><button class="vw-nav r" data-act="vwStep" data-v="1" aria-label="${L('Следующее','Next')}">${I.chev}</button><div class="vw-dots">${items.map(()=>'<i></i>').join('')}</div>`:''}`;
 el.style.removeProperty('--dy');requestAnimationFrame(()=>{el.classList.add('on');syncModal();$('[data-act="vwClose"]',el).focus({preventScroll:true});});
 vwGo(VW.i,true);
 const tr=$('#vwTrack');let sx=0,sy=0,dx=0,dy=0,id=null,mode=null;
 tr.onpointerdown=e=>{if(e.target.closest('video'))return;id=e.pointerId;sx=e.clientX;sy=e.clientY;dx=dy=0;mode=null;tr.setPointerCapture(id);};
 tr.onpointermove=e=>{if(e.pointerId!==id)return;dx=e.clientX-sx;dy=e.clientY-sy;if(!mode&&Math.hypot(dx,dy)>8)mode=Math.abs(dx)>Math.abs(dy)?'x':'y';
  if(mode==='x'){tr.style.transition='none';tr.style.transform=`translateX(calc(${-VW.i*100}% + ${dx}px))`;}
  if(mode==='y'&&dy>0){el.style.setProperty('--dy',dy+'px');el.classList.add('drag');}};
 tr.onpointerup=tr.onpointercancel=e=>{if(e.pointerId!==id)return;id=null;tr.style.transition='';el.classList.remove('drag');
  if(mode==='x'&&Math.abs(dx)>60)vwGo(VW.i+(dx<0?1:-1));else if(mode==='y'&&dy>110)closeViewer();else{vwGo(VW.i);el.style.removeProperty('--dy');}
  if(!mode&&e.type==='pointerup'){const x=e.clientX/innerWidth;if(x<.25)vwGo(VW.i-1);else if(x>.75)vwGo(VW.i+1);}};
}
function vwGo(i,instant){if(!VW)return;i=Math.max(0,Math.min(VW.items.length-1,i));VW.i=i;const tr=$('#vwTrack');if(!tr)return;if(instant)tr.style.transition='none';tr.style.transform=`translateX(${-i*100}%)`;if(instant)requestAnimationFrame(()=>tr.style.transition='');
 const n=$('#vwN');if(n)n.textContent=VW.items.length>1?`${i+1} / ${VW.items.length}`:'';$$('#viewer .vw-dots i').forEach((d,k)=>d.classList.toggle('on',k===i));$$('#viewer video').forEach((v,k)=>{if(k!==i)v.pause();});
 $('#viewer .vw-nav.l')?.toggleAttribute('disabled',i===0);$('#viewer .vw-nav.r')?.toggleAttribute('disabled',i===VW.items.length-1);}
function closeViewer(){const el=$('#viewer');if(!el||!el.classList.contains('on'))return false;el.classList.remove('on');el.querySelectorAll('video').forEach(v=>v.pause());const op=VW?.opener;VW=null;setTimeout(()=>{if(!el.classList.contains('on')){el.innerHTML='';el.style.removeProperty('--dy');}},260);syncModal();if(op?.isConnected)op.focus({preventScroll:true});return true;}
ACT.vwClose=()=>closeViewer();
ACT.vwStep=a=>vwGo(VW.i+(+a.dataset.v));
document.addEventListener('keydown',e=>{if(!VW)return;if(e.key==='ArrowRight'){vwGo(VW.i+1);e.stopImmediatePropagation();}if(e.key==='ArrowLeft'){vwGo(VW.i-1);e.stopImmediatePropagation();}if(e.key==='Escape'){closeViewer();e.stopImmediatePropagation();}},true);

/** media grid for posts and albums: 1 → full, 2 → halves, 3+ → mosaic; tap opens the viewer */
function mediaGrid(list,o={}){if(!list||!list.length)return '';const n=list.length;const id=o.id||'';
 return `<div class="mgrid n${Math.min(n,4)}" ${o.attrs||''}>${list.slice(0,4).map((m,i)=>`<button class="mcell" data-act="mView" data-v="${esc(id)}" data-i="${i}" aria-label="${L('Открыть на весь экран','Open full screen')}">${m.type==='video'?`<video src="${esc(m.url)}" muted playsinline preload="metadata"></video><span class="dur">${I.video}${fmtDur(m.dur||0)}</span>`:m.type==='plate'?plate(m.key,'image'):`<img src="${esc(m.url)}" alt="" loading="lazy" draggable="false" style="${m.style||''}">`}${i===3&&n>4?`<span class="more">+${n-4}</span>`:''}</button>`).join('')}</div>`;}
const MEDIA_SRC={};
ACT.mView=(a,e)=>{e?.stopPropagation();const id=a.dataset.v;const list=(MEDIA_SRC[id]?MEDIA_SRC[id]():postById(id)?.media)||[];openViewer(list.map(m=>m.type==='plate'?m:{type:m.type,src:m.url,style:m.style}),+a.dataset.i);};
