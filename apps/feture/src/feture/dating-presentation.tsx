import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useOptionalAuth } from '@appbase/ui-react/auth.js';

const PresentationContext=createContext<{enabled:boolean;setEnabled:(value:boolean)=>void}|null>(null);
/** Prelaunch presentation choice only. Does NOT enable server discovery/consent. */
export function DatingPresentationProvider({children}:{children:ReactNode}){
 const auth=useOptionalAuth();
 const scope=auth.session?.email??'guest';
 const [choice,setChoice]=useState({scope,enabled:false});
 useEffect(()=>{setChoice({scope,enabled:false})},[scope]);
 const enabled=choice.scope===scope&&choice.enabled;
 return <PresentationContext.Provider value={{enabled,setEnabled:value=>setChoice({scope,enabled:value})}}>{children}</PresentationContext.Provider>;
}
export function useDatingPresentation(){
 const context=useContext(PresentationContext);
 if(!context)throw new Error('dating_presentation_provider_missing');
 return context;
}
