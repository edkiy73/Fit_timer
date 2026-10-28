import type {ComponentProps} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {EyeOff,KeyRound} from 'lucide-react';
import {Ask as KitAsk} from './kit';

/** `audTag()` — who sees a block. */
export function AudTag({k}:{k:'all'|'granted'|'only'|string|null|undefined}){
 const {t}=useI18n();const key=k==='granted'||k==='only'?k:'all';
 return <span className={'aud'+(key==='granted'?' k':key==='only'?' w':'')}>{key==='granted'?<KeyRound/>:key==='only'?<EyeOff/>:null}{t('fe.mx.aud.'+key)}</span>;
}

/** `ask()` — the kit's confirmation dialog; «Я» keeps the accent icon on a destructive question (`.ico.l`). */
export function Ask(props:ComponentProps<typeof KitAsk>){
 return <KitAsk {...props} tone={props.tone??(props.danger?'l':undefined)}/>;
}
