import {act,render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {createMemoryRouter,RouterProvider} from 'react-router';
import {ComparisonPage} from './comparison-page';

const {request,session}=vi.hoisted(()=>({request:vi.fn(),session:{email:'owner@example.com',deviceId:'device',syncToken:'token'}}));
vi.mock('./domain-api',()=>({domainRequest:request,domainErrorMessage:()=> 'Недоступно'}));
vi.mock('@appbase/ui-react/auth.js',()=>({useOptionalAuth:()=>({loading:false,session})}));

it('keeps the confirmed consent state after a delayed focus refresh during approval',async()=>{
 const id='91e9ee01-e4e2-4900-a7ad-144c46442390';
 const pending={ok:true,comparison:{id,linkId:id,role:'owner',revision:1,state:'pending',expiresAt:'2030-01-01T00:00:00Z'},myItems:[{title:'Тема',stance:'curious'}],items:null,requestId:id};
 const active={...pending,comparison:{...pending.comparison,state:'active',revision:2},items:[{title:'Тема',mine:'curious',theirs:'fantasy'}]};
 let approved=false,reads=0;
 let settleApproval!:(value:unknown)=>void;
 let settleStaleRead:((value:unknown)=>void)|undefined;
 request.mockReset().mockImplementation((_session,body)=>{
  if(body.action==='share.compare.approve')return new Promise(resolve=>{settleApproval=resolve;});
  if(body.action==='share.compare.read'){
   if(++reads===1)return Promise.resolve(pending);
   if(approved)return Promise.resolve(active);
   return new Promise(resolve=>{settleStaleRead=resolve;});
  }
  throw new Error('unexpected action');
 });
 const router=createMemoryRouter([{path:'/compare/:comparisonId',element:<ComparisonPage/>}],{initialEntries:['/compare/'+id]});
 render(<RouterProvider router={router}/>);
 const user=userEvent.setup();
 await user.click(await screen.findByRole('checkbox'));
 await user.click(screen.getByRole('button',{name:'Разрешить сравнение'}));
 await act(async()=>{window.dispatchEvent(new Event('focus'));});
 await act(async()=>{approved=true;settleApproval(active);});
 await screen.findByRole('heading',{name:'Общие выбранные темы'});
 await act(async()=>{settleStaleRead?.(pending);});
 await waitFor(()=>expect(screen.queryByText('Результат закрыт до согласия владельца ссылки.')).toBeNull());
 expect(screen.getByRole('heading',{name:'Общие выбранные темы'})).toBeTruthy();
});

it('keeps an immutable owner approval after a lost response and prevents navigation before exact replay',async()=>{
 const id='91e9ee01-e4e2-4900-a7ad-144c46442390';
 const pending={ok:true,comparison:{id,linkId:id,role:'owner',revision:3,state:'pending',expiresAt:'2030-01-01T00:00:00Z'},myItems:[{title:'Тема',stance:'curious'}],items:null,requestId:id};
 const active={...pending,comparison:{...pending.comparison,state:'active',revision:4},items:[{title:'Тема',mine:'curious',theirs:'fantasy'}]};
 const approvals:unknown[]=[];let success=false;
 request.mockReset().mockImplementation((_session,body)=>{
  if(body.action==='share.compare.read')return Promise.resolve(success?active:pending);
  if(body.action==='share.compare.approve'){
   approvals.push(structuredClone(body));
   if(approvals.length===1)return Promise.reject(new Error('server committed but response was lost'));
   success=true;return Promise.resolve(active);
  }
  throw new Error('unexpected action');
 });
 const router=createMemoryRouter([
  {path:'/compare/:comparisonId',element:<ComparisonPage/>},
  {path:'/comparisons',element:<h1>Все приглашения</h1>}
 ],{initialEntries:['/compare/'+id]});
 const user=userEvent.setup();render(<RouterProvider router={router}/>);
 await user.click(await screen.findByRole('checkbox',{name:/Я отдельно разрешаю/}));
 await user.click(screen.getByRole('button',{name:'Разрешить сравнение'}));
 await screen.findByRole('button',{name:'Повторить то же согласие'});
 expect((screen.getByRole('checkbox',{name:/Я отдельно разрешаю/}) as HTMLInputElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:'Обновить'}) as HTMLButtonElement).disabled).toBe(true);
 const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);
 expect(unload.defaultPrevented).toBe(true);
 await user.click(screen.getByRole('link',{name:'Все приглашения'}));
 await screen.findByRole('dialog',{name:'Результат согласия ещё не подтверждён'});
 expect(router.state.location.pathname).toBe('/compare/'+id);
 await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Повторить то же согласие'}));
 await screen.findByRole('heading',{name:'Общие выбранные темы'});
 expect(approvals).toHaveLength(2);
 expect(approvals[1]).toEqual(approvals[0]);
 expect((approvals[0] as {expectedRevision:number}).expectedRevision).toBe(3);
 expect(router.state.location.pathname).toBe('/compare/'+id);
 await user.click(screen.getByRole('link',{name:'Все приглашения'}));
 await screen.findByRole('heading',{name:'Все приглашения'});
});
