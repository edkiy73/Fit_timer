import {act,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {MemoryRouter,Route,Routes} from 'react-router';
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
 render(<MemoryRouter initialEntries={['/compare/'+id]}><Routes><Route path="/compare/:comparisonId" element={<ComparisonPage/>}/></Routes></MemoryRouter>);
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
