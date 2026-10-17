/* Fourth study: hold, preview a direction, release to commit one identity.
   Touch scroll remains native until the hold is armed. No synthetic click after a gesture. */
let gesture=null,blockedGestureClick=null;
const HOLD_MS=280,CHOOSE_DISTANCE=32;
function nextGestureAction(id,who){
 const a=actions[id],on=active(id,who);
 if(on&&a.type==='like')return L('Убрать лайк','Remove like');
 if(on&&a.type==='follow')return L('Отписаться','Unfollow');
 if(on&&a.type==='request')return L('Отменить запрос','Cancel request');
 return a.label?a.label():op[a.type].off();
}
function gestureAction(id,classes){
 const a=actions[id],who=owner(a.context),hasBoth=active(id,'me')&&active(id,'couple'),shown=nextGestureAction(id,who);
 return `<span class="gesture-control"><span class="${classes} gesture-action ${hasBoth?'both-active':''}"><button class="fire hold-fire" data-fire="${id}" data-hold="${id}" aria-label="${esc(shown+' '+by(who))}" aria-describedby="gesture-guide" aria-pressed="${active(id,who)}">${actionIcon(id,who)}${a.circle?'':`<span>${esc(a.count!=null?actionLabel(id,who):shown)}</span>`}</button><button class="identity" data-menu="${id}" aria-label="${esc(L('Изменить автора: ','Change identity: ')+name(who))}" aria-haspopup="dialog">${avatar(who)}${a.compact||a.circle?'':`<span class="who">${short(who)}</span>`}${icon('down')}</button></span><span class="gesture-states" aria-label="${esc(L('Состояния авторов','Identity states'))}">${['me','couple'].map(w=>`<span class="identity-state ${active(id,w)?'done':''}" title="${esc(name(w))}">${avatar(w,'small')}<span>${short(w)}</span>${active(id,w)?icon('check'):'<i aria-hidden="true"></i>'}<span class="sr-only">${active(id,w)?L('действие выполнено','action active'):L('действие не выполнено','no action')}</span></span>`).join('')}</span></span>`;
}
function blockGestureClick(id){blockedGestureClick={id,until:Date.now()+700};}
function cancelGesture(){
 if(!gesture)return;
 clearTimeout(gesture.timer);gesture.button?.classList.remove('holding');
 if(gesture.armed)blockGestureClick(gesture.id);
 gesture=null;const preview=document.querySelector('#gesture-preview');if(preview)preview.hidden=true;
}
function paintGesture(){
 const g=gesture;if(!g?.armed)return;const el=$('#gesture-preview');
 el.innerHTML=`<div class="gesture-choice ${g.who==='couple'?'selected':''}"><span class="direction">↑</span>${avatar('couple')}<span><b>${L('Мы','Us')} · Alex & Eva</b><small>${esc(nextGestureAction(g.id,'couple'))}</small></span>${g.who==='couple'?icon('check'):''}</div><div class="gesture-neutral">${g.who?L('Отпусти, чтобы выполнить','Release to confirm'):L('Центр — отмена','Center — cancel')}</div><div class="gesture-choice ${g.who==='me'?'selected':''}"><span class="direction">↓</span>${avatar('me')}<span><b>${L('Я','Me')} · Alex</b><small>${esc(nextGestureAction(g.id,'me'))}</small></span>${g.who==='me'?icon('check'):''}</div>`;
 el.hidden=false;const r=g.button.getBoundingClientRect(),viewH=window.visualViewport?.height||innerHeight;
 el.style.left=Math.min(Math.max(12,r.left+r.width/2-el.offsetWidth/2),innerWidth-el.offsetWidth-12)+'px';
 el.style.top=Math.min(Math.max(12,r.top+r.height/2-el.offsetHeight/2),Math.max(12,viewH-el.offsetHeight-12))+'px';
}
function armGesture(){
 const g=gesture;if(!g||!g.button.isConnected||variant!=='gesture'||!hasPair){cancelGesture();return;}
 g.armed=true;g.button.classList.add('holding');paintGesture();
}
function startGesture(button,x,y,kind,token){
 cancelGesture();if(variant!=='gesture'||!hasPair)return;
 gesture={button,id:button.dataset.hold,x,y,kind,token,who:null,armed:false,timer:setTimeout(armGesture,HOLD_MS)};
}
function moveGesture(x,y){
 const g=gesture;if(!g)return;const dx=x-g.x,dy=y-g.y;
 if(!g.armed){if(Math.hypot(dx,dy)>9){blockGestureClick(g.id);cancelGesture();}return;}
 g.who=Math.abs(dx)>90?null:dy<=-CHOOSE_DISTANCE?'couple':dy>=CHOOSE_DISTANCE?'me':null;paintGesture();
}
function finishGesture(){
 const g=gesture;if(!g)return false;const commit=g.armed&&g.who,id=g.id,who=g.who,armed=g.armed;
 cancelGesture();if(!armed)return false;blockGestureClick(id);
 if(commit){authors[actions[id].context]=who;perform(id,who);}else notify(L('Действие отменено','Action cancelled'));
 return true;
}
// Capture runs before the ordinary click handler, including clicks synthesized by touch.
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-hold]');if(b&&blockedGestureClick?.id===b.dataset.hold&&Date.now()<blockedGestureClick.until){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.button!==0)return;const b=e.target.closest?.('[data-hold]');if(b){startGesture(b,e.clientX,e.clientY,'pointer',e.pointerId);b.setPointerCapture?.(e.pointerId);}});
document.addEventListener('pointermove',e=>{if(gesture?.kind==='pointer'&&gesture.token===e.pointerId)moveGesture(e.clientX,e.clientY);});
document.addEventListener('pointerup',e=>{if(gesture?.kind==='pointer'&&gesture.token===e.pointerId){const armed=finishGesture();if(armed)e.preventDefault();}});
document.addEventListener('pointercancel',e=>{if(gesture?.kind==='pointer'&&gesture.token===e.pointerId)cancelGesture();});
document.addEventListener('touchstart',e=>{if(e.touches.length!==1){cancelGesture();return;}const b=e.target.closest?.('[data-hold]');if(b){const t=e.touches[0];startGesture(b,t.clientX,t.clientY,'touch',t.identifier);}},{passive:true});
document.addEventListener('touchmove',e=>{if(gesture?.kind!=='touch')return;const t=[...e.touches].find(t=>t.identifier===gesture.token);if(!t){cancelGesture();return;}if(gesture.armed)e.preventDefault();moveGesture(t.clientX,t.clientY);},{passive:false});
document.addEventListener('touchend',e=>{if(gesture?.kind==='touch'&&[...e.changedTouches].some(t=>t.identifier===gesture.token)){if(gesture.armed)e.preventDefault();finishGesture();}},{passive:false});
document.addEventListener('touchcancel',()=>{if(gesture?.kind==='touch')cancelGesture();});
document.addEventListener('contextmenu',e=>{if(e.target.closest?.('[data-hold]')&&gesture?.armed)e.preventDefault();});
document.addEventListener('keydown',e=>{
 const b=e.target.closest?.('[data-hold]');
 if(b&&['ArrowUp','ArrowDown'].includes(e.key)&&variant==='gesture'&&hasPair){e.preventDefault();e.stopImmediatePropagation();if(gesture?.button!==b){startGesture(b,0,0,'keyboard',null);clearTimeout(gesture.timer);armGesture();}gesture.who=e.key==='ArrowUp'?'couple':'me';paintGesture();return;}
 if(gesture?.kind==='keyboard'&&['Enter',' ','Escape','Tab'].includes(e.key)){
  if(e.key==='Tab'){cancelGesture();return;}e.preventDefault();e.stopImmediatePropagation();if(e.key==='Escape')cancelGesture();else finishGesture();
 }
},true);
window.addEventListener('blur',cancelGesture);window.addEventListener('resize',cancelGesture);
document.addEventListener('scroll',cancelGesture,{capture:true,passive:true});
