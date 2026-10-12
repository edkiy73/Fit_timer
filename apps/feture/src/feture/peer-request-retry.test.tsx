import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createMemoryRouter,RouterProvider} from 'react-router';
import {expect,it,vi} from 'vitest';
import {DomainClientError} from './domain-api';
import {PeerProfilePage} from './access-page';

const {request,session}=vi.hoisted(()=>({
 request:vi.fn(),
 session:{email:'viewer@example.com',deviceId:'device',syncToken:'token'}
}));
vi.mock('./domain-api',async()=>({...await vi.importActual('./domain-api'),domainRequest:request}));
vi.mock('../auth',()=>({authClient:{getSession:async()=>session}}));
vi.mock('@appbase/ui-react/auth.js',()=>({useOptionalAuth:()=>({loading:false,session})}));

it('does not lose or change the peer access request after an unknown response and consent denial',async()=>{
 const id='91e9ee01-e4e2-4900-a7ad-144c46442390';
 const sent:unknown[]=[];
 request.mockReset().mockImplementation((_session,body)=>{
  if(body.action==='access.profile')return Promise.resolve({
   ok:true,requestId:id,id,isOwner:false,
   projection:{fields:{},interests:[],canMessage:false}
  });
  if(body.action!=='access.request')throw new Error('unexpected action');
  sent.push(body);
  if(sent.length===1)return Promise.reject(new Error('lost response'));
  if(sent.length===2)return Promise.reject(new DomainClientError('consent_required'));
  return Promise.resolve({ok:true,requestId:id,accessId:id});
 });
 const router=createMemoryRouter([
  {path:'/people/:id',element:<PeerProfilePage/>},
  {path:'/access',element:<h1>Мои разрешения</h1>}
 ],{initialEntries:['/people/'+id]});
 const user=userEvent.setup();
 render(<RouterProvider router={router}/>);
 await user.click(await screen.findByRole('checkbox',{name:'Имя'}));
 await user.click(screen.getByRole('button',{name:'Отправить запрос'}));
 await screen.findByText(/Результат запроса пока неизвестен/);
 expect(screen.getByRole('checkbox',{name:'Имя'}).matches(':disabled')).toBe(true);
 await user.click(screen.getByRole('link',{name:'← Мои разрешения'}));
 await screen.findByRole('dialog',{name:'Запрос ещё не подтверждён'});
 expect(router.state.location.pathname).toBe('/people/'+id);
 await user.click(screen.getByRole('button',{name:'Повторить прежний запрос'}));
 await screen.findByText('Прочитай актуальные документы и подтверди согласие.');
 expect(sent).toHaveLength(2);
 expect(sent[1]).toEqual(sent[0]);
 expect(screen.getByRole('checkbox',{name:'Имя'}).matches(':disabled')).toBe(true);
 await user.click(screen.getByRole('button',{name:'Повторить прежний запрос'}));
 await screen.findByText('Запрос отправлен. Доступ появится после решения владельца.');
 expect(sent).toHaveLength(3);
 expect(sent[2]).toEqual(sent[0]);
 expect(sent[0]).toMatchObject({action:'access.request',targetId:id,
  operationId:expect.any(String),scopes:['profile:nickname'],canMessage:false});
 await user.click(screen.getByRole('link',{name:'← Мои разрешения'}));
 await waitFor(()=>expect(router.state.location.pathname).toBe('/access'));
});
