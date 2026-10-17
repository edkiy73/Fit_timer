/* Injected ONLY into isolated srcdoc copies of V10 by the comparison page. */
// srcdoc keeps its own history entries; route hashes must not try to change its URL.
if(location.href==='about:srcdoc'){
 const replace=history.replaceState.bind(history),push=history.pushState.bind(history);
 history.replaceState=(state,title)=>replace(state,title);
 history.pushState=(state,title)=>push(state,title);
}
window.FT_LAB_BRIDGE={
 init(pair,lang){S.lang=lang;document.documentElement.lang=lang;if(pair&&activePair()){const p=coupleProfile();p.dating=true;p.datingVisible=true;p.socialLikes=true;}},
 actor(id){if(id==='couple'&&!activePair())return false;S.author=id;if(cur().p.actor&&cur().id!=='H02')cur().p.actor=id;return true;},
 current(){return actionAuthor();},
 personalIdle(){if(actionAuthor()==='me'||deckBusy||S.ui.sheet||$('#matchLayer .match')||['C03','C06','C07','H02','E03','P08'].includes(cur().id))return;this.choose('me');},
 screen(){return cur().id;},
 isPair(){return activePair();},
 eligible(b){const a=b.dataset.act;if(['C03','C06','C07','H02','E03'].includes(cur().id))return false;return ['likePost','rLike','follow','flwToggle','likeProfile','unlikeP','reqAccess','publishNow','publish','sendComment'].includes(a)||(a==='decide'&&b.dataset.v==='1');},
 info(b){const a=b.dataset.act,dating=a==='decide',type=['follow','flwToggle'].includes(a)?'follow':['likePost','rLike','likeProfile','unlikeP','decide'].includes(a)?'like':a==='reqAccess'?'request':['publish','publishNow'].includes(a)?'publish':'send';const target=dating?$('#deck .pc.top')?.dataset.id:b.dataset.v||cur().p.id||'';return{act:a,type,target,key:[cur().id,a==='unlikeP'?'likeProfile':a,target,b.dataset.i||''].join(':'),both:['like','follow'].includes(type),title:type==='follow'?L('Подписаться','Follow'):type==='like'?L('Нравится','Like'):type==='request'?L('Запросить доступ','Request access'):type==='publish'?L('Опубликовать','Publish'):L('Отправить ответ','Send reply')};},
 state(b,who){const x=this.info(b),st=social(who);if(!st)return false;if(x.type==='follow')return st.follows.has(x.target);if(x.act==='likePost'){const p=postById(x.target);return !!(p?.reactions?p.reactions[who]:who==='me'&&p?.liked);}if(x.act==='rLike'){const r=replyAt(b);return !!(r?.c.reactions?r.c.reactions[who]:who==='me'&&r?.c.liked);}if(x.type==='like')return st.likesOut.some(l=>l.p===x.target);if(x.type==='request')return st.reqOut.some(r=>r.p===x.target&&r.status==='pending');return false;},
 invoke(b,choice){const info=this.info(b),actors=choice==='both'?['me','couple']:[choice];if(actors.some(x=>x==='couple'&&!activePair()))return;
  if(info.act==='decide'){
   // Resolve the same visible person for both identities before the card advances once.
   const id=info.target;if(!id)return;for(const who of actors.slice(0,-1)){this.actor(who);social().decided[id]=1;social().history.unshift({p:id,d:1,t:Date.now()});likePerson(id,'discover');}
   this.actor(actors.at(-1));decide(1);return;
  }
  if(['likeProfile','unlikeP'].includes(info.act)){
   const desired=choice==='both'?!actors.every(w=>this.state(b,w)):null;for(const who of actors){if(desired!==null&&this.state(b,who)===desired)continue;this.actor(who);if(social().likesOut.some(l=>l.p===info.target))social().likesOut=social().likesOut.filter(l=>l.p!==info.target);else likePerson(info.target,'profile');}refresh();return;
  }
  const desired=choice==='both'?!actors.every(w=>this.state(b,w)):null;for(const who of actors){if(desired!==null&&this.state(b,who)===desired)continue;this.actor(who);if(info.act==='likePost')b.dataset.authorConfirmed='1';try{ACT[info.act]?.(b);}finally{if(info.act==='likePost')delete b.dataset.authorConfirmed;}}
 },
 choose(who){if(this.actor(who)){paintAuthor();paintReactions();}},
 toast(text){toast(text,{type:'ok'});}
};
