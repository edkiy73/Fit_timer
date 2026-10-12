import {act,render,screen} from '@testing-library/react';
import {MemoryRouter,Route,Routes} from 'react-router';
import {expect,it,vi} from 'vitest';
import {SharedCardPage} from './share-links-page';

const {request}=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('./domain-api',()=>({domainRequest:request,domainErrorMessage:()=> 'Не удалось проверить доступ.'}));
vi.mock('@appbase/ui-react/auth.js',()=>({useOptionalAuth:()=>({
 loading:false,session:{email:'test@example.com',deviceId:'device',syncToken:'token'}
})}));

it('hides the previously visible private projection while revalidating a revoked link on focus',async()=>{
 const linkId='91e9ee01-e4e2-4900-a7ad-144c46442390';
 const card={ok:true,requestId:linkId,card:{
  expiresAt:'2099-01-01T00:00:00Z',items:[{title:'Личная выбранная тема',stance:'curious'}]
 }};
 let rejectRefresh!:(e:Error)=>void;
 let calls=0;
 request.mockReset().mockImplementation((_session,command)=>{
  expect(command).toEqual({action:'share.read',linkId});
  if(++calls===1)return Promise.resolve(card);
  return new Promise((_resolve,reject)=>{rejectRefresh=reject;});
 });
 render(<MemoryRouter initialEntries={['/share/'+linkId]}><Routes><Route path="/share/:linkId" element={<SharedCardPage/>}/></Routes></MemoryRouter>);
 expect(await screen.findByText('Личная выбранная тема')).toBeTruthy();
 await act(async()=>{window.dispatchEvent(new Event('focus'));});
 expect(await screen.findByText('Проверяем право доступа…')).toBeTruthy();
 expect(screen.queryByText('Личная выбранная тема')).toBeNull();
 await act(async()=>{rejectRefresh(new Error('resource_not_found'));});
 expect(await screen.findByText('Ссылка недоступна, отозвана или срок её действия истёк.')).toBeTruthy();
 expect(screen.queryByText('Личная выбранная тема')).toBeNull();
 expect(calls).toBe(2);
});
