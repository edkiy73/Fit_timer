import {useEffect,useState} from 'react';

/** Desktop in the kit's grid (base.css `@container stage (min-width:1100px)`): the chats split and the context column.
 * Parts that read data only for desktop mount behind this, so a phone or a tablet never asks for it. */
export const WIDE='(min-width:1100px)';
export function useWide(){
 const [w,setW]=useState(()=>typeof matchMedia==='function'&&matchMedia(WIDE).matches);
 useEffect(()=>{if(typeof matchMedia!=='function')return;const m=matchMedia(WIDE);const on=()=>setW(m.matches);m.addEventListener('change',on);return ()=>m.removeEventListener('change',on);},[]);
 return w;
}
