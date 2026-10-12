import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createMemoryRouter,RouterProvider} from 'react-router';
import {expect,it,vi} from 'vitest';
import {ModerationPage} from './moderation-page';

const {request,session}=vi.hoisted(()=>({
 request:vi.fn(),
 session:{email:'reporter@example.com',deviceId:'device',syncToken:'token'}
}));
vi.mock('./domain-api',async()=>({...await vi.importActual('./domain-api'),domainRequest:request}));
vi.mock('../auth',()=>({authClient:{getSession:async()=>session}}));
vi.mock('@appbase/ui-react/auth.js',()=>({useOptionalAuth:()=>({loading:false,session})}));

it('keeps an identical report receipt after a lost response and blocks unsafe Back',async()=>{
 const targetId='91e9ee01-e4e2-4900-a7ad-144c46442390';
 const sent:unknown[]=[];
 request.mockReset().mockImplementation((_session,body)=>{
  if(body.action==='moderation.status')return Promise.resolve({
   ok:true,items:[],restriction:null,nextCursor:null,requestId:targetId
  });
  if(body.action!=='moderation.report')throw new Error('unexpected command');
  sent.push(body);
  if(sent.length===1)return Promise.reject(new Error('network reply lost'));
  return Promise.resolve({ok:true,reportId:body.operationId,requestId:targetId});
 });
 const router=createMemoryRouter([
  {path:'/report/:targetId',element:<ModerationPage/>},
  {path:'/account',element:<h1>Мой аккаунт</h1>}
 ],{initialEntries:['/report/'+targetId]});
 const user=userEvent.setup();
 render(<RouterProvider router={router}/>);
 const note=await screen.findByRole('textbox',{name:'Что произошло'});
 await user.type(note,'Пожалуйста, проверьте доступ к профилю.');
 await user.click(screen.getByRole('button',{name:'Отправить обращение'}));
 await screen.findByText(/Исход жалобы пока неизвестен/);
 expect(note.matches(':disabled')).toBe(true);
 await user.click(screen.getByRole('link',{name:'← Аккаунт'}));
 await screen.findByRole('dialog',{name:'Жалоба ещё не подтверждена'});
 expect(router.state.location.pathname).toBe('/report/'+targetId);
 await user.click(screen.getByRole('button',{name:'Повторить прежнюю жалобу'}));
 await screen.findByText('Обращение получено. Модератор рассмотрит его отдельно.');
 expect(sent).toHaveLength(2);
 expect(sent[1]).toEqual(sent[0]);
 expect(sent[0]).toMatchObject({action:'moderation.report',targetId,operationId:expect.any(String),
  note:'Пожалуйста, проверьте доступ к профилю.',reason:'other',field:null});
 await user.click(screen.getByRole('link',{name:'← Аккаунт'}));
 await waitFor(()=>expect(router.state.location.pathname).toBe('/account'));
});
