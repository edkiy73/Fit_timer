import {useEffect,useState} from 'react';
import {z} from 'zod';
import type {AdminSectionContext} from '@appbase/ui-react/admin.js';
const role=z.enum(['manager','qa_operator','auditor']).nullable();
const schema=z.object({ok:z.literal(true),role,initialized:z.boolean(),events:z.array(z.object({actor:z.string().regex(/^[a-f0-9]{32}$/),accountHash:z.string().regex(/^[a-f0-9]{32}$/),action:z.enum(['bootstrap','role_set']),role,revision:z.number().int().positive(),at:z.iso.datetime({offset:true})}).strict()).max(25),items:z.array(z.object({accountHash:z.string().regex(/^[a-f0-9]{32}$/),role,revision:z.number().int().positive()}).strict()).max(100)}).strict();
const labels={manager:'Управление операторами',qa_operator:'Выдача и отзыв QA-доступа',auditor:'Чтение журнала QA'};
export function OperatorsAdmin({client,adminKey}:AdminSectionContext){
 const [data,setData]=useState<z.infer<typeof schema>|null>(null),[email,setEmail]=useState(''),[selected,setSelected]=useState(''),[nextRole,setNextRole]=useState<z.infer<typeof role>>('qa_operator'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async()=>{setBusy(true);setError('');try{setData(schema.parse(await client.action(adminKey,'feture.operators.status')));}catch{setData(null);setError('Войди в свой обычный аккаунт на вкладке «Аккаунт», затем открой этот раздел заново.');}finally{setBusy(false);}};
 useEffect(()=>{let live=true;setBusy(true);void client.action(adminKey,'feture.operators.status').then(x=>{if(live)setData(schema.parse(x));}).catch(()=>{if(live){setData(null);setError('Войди в свой обычный аккаунт на вкладке «Аккаунт», затем открой этот раздел заново.');}}).finally(()=>{if(live)setBusy(false);});return()=>{live=false;};},[client,adminKey]);
 const run=async(action:string,body:Record<string,unknown>)=>{setBusy(true);setError('');try{setData(schema.parse(await client.action(adminKey,action,body)));setEmail('');setSelected('');}catch{setError('Изменение не подтверждено. Обнови список: могли измениться права или версия записи. Последнего управляющего отключить нельзя.');}finally{setBusy(false);}};
 const entry=data?.items.find(x=>x.accountHash===selected);
 return <section className="ft-access"><h2>Операторы QA</h2>
 <p>Войди в личный аккаунт: каждое решение о временном доступе будет связано с ним. Эти роли действуют только для QA-доступа и его журнала, без доступа к личным картам, ответам и дневникам.</p>
 {data&&<p>Твоя роль: {data.role?labels[data.role]:'не назначена'}.</p>}
 {data&&!data.initialized&&<><p>Владелец с админ-ключом один раз назначает свой текущий аккаунт управляющим. После этого ключ сам по себе не позволяет выдавать QA-доступ или назначать роли.</p><button disabled={busy} onClick={()=>{if(window.confirm('Назначить текущий личный аккаунт первым управляющим операторами?'))void run('feture.operators.bootstrap',{});}}>Назначить мой аккаунт управляющим</button></>}
 {data?.role==='manager'&&<><h3>Назначить или изменить роль</h3>
 <label>Запись<select disabled={busy} value={selected} onChange={e=>{setSelected(e.target.value);setEmail('');}}><option value="">Новый оператор</option>{data.items.map(x=><option key={x.accountHash} value={x.accountHash}>{x.accountHash} · {x.role?labels[x.role]:'отозвана'} · версия {x.revision}</option>)}</select></label>
 <label>Email существующего аккаунта<input disabled={busy} type="email" autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)}/></label><p>Для изменения выбери запись и введи email этого аккаунта.</p>
 <label>Права<select disabled={busy} value={nextRole||'revoked'} onChange={e=>setNextRole(e.target.value==='revoked'?null:e.target.value as Exclude<z.infer<typeof role>,null>)}><option value="qa_operator">Выдача и отзыв QA-доступа</option><option value="auditor">Только чтение журнала</option><option value="manager">Управление операторами и QA-доступом</option><option value="revoked">Отозвать права</option></select></label>
 <button disabled={busy||!email.trim()} onClick={()=>{if(window.confirm('Изменить права указанного аккаунта?'))void run('feture.operators.set',{email:email.trim().toLowerCase(),role:nextRole,expectedRevision:entry?.revision||0,...(entry?{expectedAccountHash:entry.accountHash}:{})});}}>Сохранить права</button></>}
 {data&&(data.role==='manager'||data.role==='auditor')&&<><h3>История назначения прав</h3><p>Последние 25 решений. Только отпечатки аккаунтов и изменения роли, без email и личных текстов.</p><ul>{data.events.map((x,i)=><li key={x.at+':'+i}>{new Date(x.at).toLocaleString('ru')} · {x.actor.slice(0,8)}… → {x.accountHash.slice(0,8)}… · {x.role?labels[x.role]:'права отозваны'}</li>)}</ul></>}
 <button disabled={busy} onClick={()=>void load()}>Обновить</button>{error&&<p role="alert">{error}</p>}
 </section>;
}
