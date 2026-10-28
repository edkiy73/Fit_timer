import {createContext,useContext,useEffect} from 'react';

/** Shell API: a screen asks the frame to hide the phone dock while one of its modes is on (the gallery's selection
 * mode keeps its own action bar at the bottom, V21 SC.P20 `dock:false` while selecting). The frame (shell.tsx) counts
 * the requests, so two screens never fight over it, and the dock comes back when the mode ends or the screen leaves. */
export const DockHide=createContext<(on:boolean)=>void>(()=>{});

/** Hides the dock while `on` is true. */
export function useHideDock(on:boolean){
 const hide=useContext(DockHide);
 useEffect(()=>{if(!on)return;hide(true);return ()=>hide(false);},[on,hide]);
}
