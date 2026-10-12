import {act,render,screen} from '@testing-library/react';
import {MemoryRouter,Route,Routes} from 'react-router';
import {expect,it,vi} from 'vitest';
import {PeerProfilePage} from './access-page';

const {request,session}=vi.hoisted(()=>({
 request:vi.fn(),
 session:{email:'viewer@example.com',deviceId:'viewer-device',syncToken:'viewer-session'}
}));
vi.mock('./domain-api',()=>({
 domainRequest:request,
 domainErrorMessage:()=> 'Доступ к профилю больше не подтверждён.'
}));
vi.mock('@appbase/ui-react/auth.js',()=>({
 useOptionalAuth:()=>({loading:false,session})
}));

it('removes stale private profile fields on return and keeps them hidden after access revocation',async()=>{
 const id='91e9ee01-e4e2-4900-a7ad-144c46442390';
 let denyAccess!:(e:Error)=>void;
 let reads=0;
 request.mockReset().mockImplementation((_session,command)=>{
  expect(command).toEqual({action:'access.profile',targetId:id});
  if(++reads===1)return Promise.resolve({
   ok:true,requestId:id,id,isOwner:false,
   projection:{fields:{about:'Секретное описание'},interests:[],canMessage:false}
  });
  return new Promise((_resolve,reject)=>{denyAccess=reject;});
 });
 render(<MemoryRouter initialEntries={['/people/'+id]}>
  <Routes><Route path="/people/:id" element={<PeerProfilePage/>}/></Routes>
 </MemoryRouter>);
 expect(await screen.findByText('Секретное описание')).toBeTruthy();
 await act(async()=>{window.dispatchEvent(new Event('focus'));});
 expect(screen.queryByText('Секретное описание')).toBeNull();
 expect(await screen.findByText('Загружаем…')).toBeTruthy();
 await act(async()=>{denyAccess(new Error('resource_not_found'));});
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','Доступ к профилю больше не подтверждён.');
 expect(screen.queryByText('Секретное описание')).toBeNull();
 expect(reads).toBe(2);
});
