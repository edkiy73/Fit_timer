import {useEffect,useState} from 'react';

/** Desktop in the kit's grid (base.css `@container stage (min-width:1100px)`): the chats split and the context column.
 * Parts that read data only for desktop mount behind this, so a phone or a tablet never asks for it. */
export const WIDE='(min-width:1100px)';
export function useWide(){
 const [w,setW]=useState(()=>typeof matchMedia==='function'&&matchMedia(WIDE).matches);
 useEffect(()=>{if(typeof matchMedia!=='function')return;const m=matchMedia(WIDE);const on=()=>setW(m.matches);m.addEventListener('change',on);return ()=>m.removeEventListener('change',on);},[]);
 return w;
}

/** The side menu is on screen (base.css `@container stage (min-width:768px)`: the rail from 768, the full menu from 1280;
 * below it the phone dock). The menu lists «События» and «Сообщества» apart; the dock keeps one «Комьюнити». */
export const SIDE_NAV='(min-width:768px)';
export function useSideNav(){
 const [w,setW]=useState(()=>typeof matchMedia==='function'&&matchMedia(SIDE_NAV).matches);
 useEffect(()=>{if(typeof matchMedia!=='function')return;const m=matchMedia(SIDE_NAV);const on=()=>setW(m.matches);m.addEventListener('change',on);return ()=>m.removeEventListener('change',on);},[]);
 return w;
}
