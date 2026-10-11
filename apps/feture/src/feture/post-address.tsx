import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import {domainRequest,domainErrorMessage} from './domain-api';
const schema=z.object({ok:z.literal(true),code:z.uuid(),replayed:z.boolean(),requestId:z.uuid()}).strict();
export function PostAddress({session,onRotated}:{session:AuthSession;onRotated:()=>void}){
 const [code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const operation=useRef<string|null>(null),active=useRef(true),initial=useRef<AbortController|null>(null);
 useEffect(()=>{active.current=true;const controller=new AbortController();initial.current=controller;void domainRequest(session,{action:'posts.address'},schema,controller.signal).then(r=>{if(!controller.signal.aborted)setCode(r.code);}).catch(e=>{if(!controller.signal.aborted)setError(domainErrorMessage(e));});return()=>{active.current=false;controller.abort();};},[session]);
 const rotate=async()=>{if(busy)return;if(!operation.current&&!window.confirm('Сменить код? Доступ ко всем публикациям, в которых выбран твой прежний код, закроется. Общие обсуждения останутся доступны.'))return;initial.current?.abort();operation.current??=crypto.randomUUID();setBusy(true);setError('');setNotice('');try{const r=await domainRequest(session,{action:'posts.rotateAddress',operationId:operation.current},schema);if(!active.current)return;operation.current=null;setCode(r.code);setNotice('Код изменён. Прежние доступы закрыты.');onRotated();}catch(e){if(active.current){setCode('');setError(domainErrorMessage(e));}}finally{if(active.current)setBusy(false);}};
 return <section className="ft-post ft-post-address"><h2>Твой код получателя</h2><p>Передай его человеку, чьи публикации хочешь получать. Код не открывает твой профиль и не заменяет вход в аккаунт.</p>{code&&<label>Личный код<input readOnly value={code} onFocus={e=>e.target.select()}/></label>}<button disabled={busy} onClick={()=>void rotate()}>{operation.current?'Повторить смену кода':'Сменить код и закрыть прежние доступы'}</button>{busy&&<p role="status">Меняем код…</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}</section>;
}
