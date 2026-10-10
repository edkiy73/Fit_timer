import { useCallback, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router';

export type ExperienceTab = 'world'|'explore'|'community'|'dating';
const scrollPositions = new Map<string, number>(); // Positions only; no profile or answer data.
export const isExperiencePath = (path:string) => path==='/' || /^\/(explore(?:\/[^/]+)?|community|dating)$/.test(path);

export function useQueryOverlay(key:string){
  const location=useLocation();
  const navigate=useNavigate();
  const params=new URLSearchParams(location.search);
  const value=params.get(key);
  const open=(next:string)=>{
    const query=new URLSearchParams(location.search);
    query.set(key,next);
    navigate({pathname:location.pathname,search:query.toString()},{state:{overlayKey:key,overlayBase:location.pathname+location.search}});
  };
  const close=()=>{
    const query=new URLSearchParams(location.search);
    query.delete(key);
    const search=query.size?'?'+query.toString():'';
    if(location.state?.overlayKey===key && location.state?.overlayBase===location.pathname+search)navigate(-1);
    else navigate({pathname:location.pathname,search},{replace:true});
  };
  return {value,open,close};
}

export function useExperienceNavigation(){
  const location=useLocation();
  const navigate=useNavigate();
  const navigationType=useNavigationType();
  const navigationRef=useRef(navigationType);
  navigationRef.current=navigationType;
  const {categoryId}=useParams();
  const overlay=useQueryOverlay('interest');
  const tab:ExperienceTab=location.pathname.startsWith('/explore')?'explore':location.pathname==='/community'?'community':location.pathname==='/dating'?'dating':'world';
  const params=new URLSearchParams(location.search);
  const query=params.get('q')||'';
  const path=location.pathname;
  const restoreScroll=useCallback((element:HTMLElement|null)=>{
    if(!element)return;
    element.scrollTo({top:navigationRef.current==='POP'?(scrollPositions.get(path)||0):0,behavior:'instant'});
  },[path]);
  const rememberScroll=(top:number)=>scrollPositions.set(path,top);
  const search=query?new URLSearchParams({q:query}).toString():'';
  const go=(next:ExperienceTab)=>navigate({pathname:next==='world'?'/':'/'+next,search:next==='explore'&&tab==='explore'?search:''});
  const openCategory=(id:string)=>navigate({pathname:'/explore/'+encodeURIComponent(id),search});
  const setQuery=(value:string)=>{
    const next=new URLSearchParams(location.search);
    if(value)next.set('q',value);else next.delete('q');
    navigate({pathname:path,search:next.toString()},{replace:true});
  };
  return {tab,selected:categoryId||null,interestId:overlay.value,query,go,openCategory,
    openInterest:overlay.open,closeInterest:overlay.close,setQuery,rememberScroll,restoreScroll};
}
