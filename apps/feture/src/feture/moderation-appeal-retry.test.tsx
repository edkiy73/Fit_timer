import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createMemoryRouter,RouterProvider} from 'react-router';
import {expect,it,vi} from 'vitest';
import {DomainClientError} from './domain-api';
import {ModerationPage} from './moderation-page';

const {request,session}=vi.hoisted(()=>({
 request:vi.fn(),
 session:{email:'subject@example.com',deviceId:'device',syncToken:'token'}
}));
vi.mock('./domain-api',async()=>({...await vi.importActual('./domain-api'),domainRequest:request}));
vi.mock('../auth',()=>({authClient:{getSession:async()=>session}}));
vi.mock('@appbase/ui-react/auth.js',()=>({useOptionalAuth:()=>({loading:false,session})}));

it('replays the exact same appeal through lost reply, denied retry and restriction change',async()=>{
 const caseId='91e9ee01-e4e2-4900-a7ad-144c46442390';
 const sent:unknown[]=[];
 let statusReads=0;
 request.mockReset().mockImplementation((_session,body)=>{
  if(body.action==='moderation.status')return Promise.resolve({
   ok:true,items:[],nextCursor:null,requestId:caseId,
   restriction:++statusReads===1
    ?{caseId,state:'hidden',reason:'policy',expiresAt:'2026-10-18T00:00:00+00:00',active:true}:null
  });
  if(body.action!=='moderation.appeal')throw new Error('unexpected action');
  sent.push(body);
  if(sent.length===1)return Promise.reject(new Error('lost reply'));
  if(sent.length===2)return Promise.reject(new DomainClientError('resource_not_found'));
  return Promise.resolve({ok:true,appealId:body.operationId,requestId:caseId});
 });
 const router=createMemoryRouter([
  {path:'/safety',element:<ModerationPage/>},
  {path:'/account',element:<h1>Аккаунт</h1>}
 ],{initialEntries:['/safety']});
 const user=userEvent.setup();
 render(<RouterProvider router={router}/>);
 const note=await screen.findByRole('textbox',{name:'Апелляция'});
 await user.type(note,'Прошу пересмотреть решение.');
 await user.click(screen.getByRole('button',{name:'Запросить пересмотр'}));
 await screen.findByText(/Исход апелляции пока неизвестен/);
 expect(note.matches(':disabled')).toBe(true);
 await user.click(screen.getByRole('link',{name:'← Аккаунт'}));
 await screen.findByRole('dialog',{name:'Апелляция ещё не подтверждена'});
 expect(router.state.location.pathname).toBe('/safety');
 await user.click(screen.getByRole('button',{name:'Повторить прежнюю апелляцию'}));
 await waitFor(()=>expect(sent).toHaveLength(2));
 expect(sent[1]).toEqual(sent[0]);
 expect(note.matches(':disabled')).toBe(true);
 await user.click(screen.getByRole('button',{name:'Обновить'}));
 await waitFor(()=>expect(statusReads).toBe(2));
 await waitFor(()=>expect(screen.queryByRole('textbox',{name:'Апелляция'})).toBeNull());
 await user.click(screen.getByRole('button',{name:'Повторить прежнюю апелляцию'}));
 await screen.findByText('Апелляция получена. Ограничение действует до решения или указанного срока.');
 expect(sent).toHaveLength(3);
 expect(sent[2]).toEqual(sent[0]);
 expect(sent[0]).toMatchObject({action:'moderation.appeal',caseId,
  text:'Прошу пересмотреть решение.',operationId:expect.any(String)});
 await user.click(screen.getByRole('link',{name:'← Аккаунт'}));
 await waitFor(()=>expect(router.state.location.pathname).toBe('/account'));
});
