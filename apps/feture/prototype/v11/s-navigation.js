/* Browser/system Back shares the application navigation, with private drafts in memory. */
let navHistory=null, historyRestoring=false, historyResume=false, navNextReplace=false;
function copyNavValue(v){
 if(Array.isArray(v))return v.map(copyNavValue);
 if(v&&Object.getPrototypeOf(v)===Object.prototype)return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,copyNavValue(x)]));
 return v;
}
const navKey=()=>JSON.stringify([!!S.session,S.nav.tab,stack().map(r=>[r.id,r.p])]);
const navState=i=>({fetureNav:navHistory.token,index:i});
function captureNav(){if(navHistory&&!historyRestoring)navHistory.entries[navHistory.index]={nav:copyNavValue(S.nav),key:navKey()};}
function startNavHistory(){
 const root=copyNavValue(S.nav);root.tab='feed';for(const st of Object.values(root.stacks))st.splice(1);root.auth.splice(1);
 navHistory={token:Math.random().toString(36).slice(2),owner:S,session:S.session,index:1,entries:[{nav:root,key:''},{nav:copyNavValue(S.nav),key:navKey()}]};
 history.replaceState(navState(0),'');history.pushState(navState(1),'');
}
function recordNav(dir){
 if(historyRestoring||!navHistory)return;
 if(navHistory.owner!==S||navHistory.session!==S.session){if(navHistory.owner!==S)clearLocalMedia();startNavHistory();return;}
 const key=navKey();if(navNextReplace){navNextReplace=false;captureNav();history.replaceState(navState(navHistory.index),'');return;}if(dir&&key!==navHistory.entries[navHistory.index]?.key){
  navHistory.entries.splice(navHistory.index+1);navHistory.index++;navHistory.entries[navHistory.index]={nav:copyNavValue(S.nav),key};history.pushState(navState(navHistory.index),'');
 }else captureNav();
}
const renderWithHistory=render;render=function(dir,keep){renderWithHistory(dir,keep);recordNav(dir);};
const saveScrollWithHistory=saveScroll;saveScroll=function(){saveScrollWithHistory();captureNav();};
const fallbackBack=back;back=function(){
 if(closeAuthorMenu())return;
 if(S.ui.ask){S.ui.ask();return;}if(closeViewer())return;if($('#matchLayer .match')){ACT.matchClose();return;}if($('#qa.open')){QA_CLOSE();return;}if(S.ui.sheet){userCloseSheet();return;}
 if(navHistory){saveScroll();history.back();return;}fallbackBack();
};
function restoreNavEntry(index){
 const entry=navHistory.entries[index];if(!entry)return;
 historyRestoring=true;navHistory.index=index;S.nav=copyNavValue(entry.nav);render('back');history.replaceState(navState(index),'');historyRestoring=false;
}
window.addEventListener('popstate',e=>{
 if(!navHistory)return;if(historyResume){historyResume=false;return;}
 if($('#authorMenu')){historyResume=true;history.go(1);closeAuthorMenu();return;}
 const from=navHistory.index;captureNav();const state=e.state;
 const resume=()=>{historyResume=true;history.go(state?.fetureNav===navHistory.token?from-state.index:1);};
 if(S.ui.ask){resume();S.ui.ask();return;}if($('#viewer.on')){resume();closeViewer();return;}if($('#matchLayer .match')){resume();ACT.matchClose();return;}if($('#qa.open')){resume();QA_CLOSE();return;}if(S.ui.sheet){resume();userCloseSheet();return;}
 if(state?.fetureNav!==navHistory.token||!navHistory.entries[state.index]){startNavHistory();return;}
 const target=state.index;
 if(target<from&&cur()?.dirty&&!cur().leaveOk){
  resume();ask({icon:'warn',title:L('Выйти без сохранения?','Leave without saving?'),text:L('Изменения в форме будут потеряны.','Changes in this form will be discarded.'),ok:L('Выйти','Leave'),cancel:L('Остаться','Stay'),danger:true}).then(ok=>{if(ok){cur().dirty=false;history.back();}});return;
 }
 if(target===0){
  if(stack().length>1||S.session&&S.nav.tab!=='feed'){restoreNavEntry(0);startNavHistory();return;}
  resume();ask({icon:'logout',title:L('Выйти из приложения?','Leave the app?'),text:L('Ты на начальном экране.','You’re on the first screen.'),ok:L('Выйти','Leave'),cancel:L('Остаться','Stay')}).then(ok=>{if(ok){navHistory=null;history.go(-2);}});return;
 }
 restoreNavEntry(target);
});
// Keyboard resizes the usable area on mobile browsers without putting CTAs behind it.
let fullH=0;
function syncViewport(){const vv=window.visualViewport,de=document.documentElement;const h=vv?.height||innerHeight;const typing=!!document.activeElement?.matches?.('input,textarea,[contenteditable]');if(!typing||!fullH)fullH=Math.max(h,innerHeight);
 de.style.setProperty('--app-h',h+'px');de.style.setProperty('--app-top',(vv?.offsetTop||0)+'px');de.classList.toggle('kb',typing&&h<fullH*.8);}
window.visualViewport?.addEventListener('resize',syncViewport);window.visualViewport?.addEventListener('scroll',syncViewport);window.addEventListener('resize',syncViewport);document.addEventListener('focusout',()=>setTimeout(syncViewport,350));syncViewport();
