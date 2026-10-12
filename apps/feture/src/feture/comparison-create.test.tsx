import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createMemoryRouter,RouterProvider} from 'react-router';
import {expect,it,vi} from 'vitest';
import {ComparisonPage} from './comparison-page';

const {request,scoped}=vi.hoisted(()=>({request:vi.fn(),scoped:{value:''}}));
const session={email:'test@example.com',deviceId:'device',syncToken:'token'};
vi.mock('@appbase/ui-react/auth.js',()=>({useOptionalAuth:()=>({loading:false,session})}));
vi.mock('./domain-api',()=>({domainRequest:request,domainErrorMessage:()=> 'Сервер не ответил.'}));
vi.mock('./use-interest-map',()=>({useInterestMap:()=>({
 scope:scoped.value,phase:'synced',pending:0,conflicts:[],
 server:{'interest-1-1':{revision:1,deleted:false,boundary:'none',stance:'curious'}}
})}));
vi.mock('./use-catalog',()=>({useCatalog:()=>({data:{categories:[{interests:[{id:'interest-1-1',title:'Тема'}]}]}})}));

it('retains one immutable comparison invite after an unknown reply and blocks navigation until retry',async()=>{
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([session.email,session.deviceId,session.syncToken])));
 scoped.value=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 const linkId='91e9ee01-e4e2-4900-a7ad-144c46442390';
 const createdId='91e9ee01-e4e2-4900-a7ad-144c46442391';
 const attempts:unknown[]=[];
 request.mockReset().mockImplementation((_session,body)=>{
  if(body.action!=='share.compare.create')throw new Error('unexpected request');
  attempts.push(body);
  if(attempts.length===1)return Promise.reject(new Error('lost reply'));
  return Promise.resolve({ok:true,comparison:{id:createdId},requestId:createdId});
 });
 const router=createMemoryRouter([
  {path:'/compare/new/:linkId',element:<ComparisonPage/>},
  {path:'/tests',element:<h1>Тесты</h1>},
  {path:'/compare/:comparisonId',element:<h1>Созданное приглашение</h1>}
 ],{initialEntries:['/compare/new/'+linkId]});
 const user=userEvent.setup();
 render(<RouterProvider router={router}/>);
 await user.click(await screen.findByRole('checkbox',{name:/Тема · Интересно/}));
 await user.click(screen.getByRole('checkbox',{name:/Я проверил выбранные отметки/}));
 await user.click(screen.getByRole('button',{name:'Предложить сравнение'}));
 await screen.findByRole('alert');
 await user.click(screen.getByRole('link',{name:'Пройти опросник'}));
 await screen.findByRole('dialog',{name:'Результат приглашения ещё не подтверждён'});
 expect(router.state.location.pathname).toBe('/compare/new/'+linkId);
 await user.click(screen.getByRole('button',{name:'Повторить то же действие'}));
 await screen.findByRole('heading',{name:'Созданное приглашение'});
 await waitFor(()=>expect(router.state.location.pathname).toBe('/compare/'+createdId));
 expect(attempts).toHaveLength(2);
 expect(attempts[1]).toEqual(attempts[0]);
 expect((attempts[0] as {comparisonId:string}).comparisonId).toBeDefined();
});
