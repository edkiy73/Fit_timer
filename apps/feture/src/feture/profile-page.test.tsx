import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createMemoryRouter,RouterProvider} from 'react-router';
import {expect,it,vi} from 'vitest';
import {ProfilePage} from './profile-page';
import {DomainClientError} from './domain-api';

const {request,session}=vi.hoisted(()=>({request:vi.fn(),session:{email:'profile@example.com',deviceId:'profile-device',syncToken:'profile-token'}}));
vi.mock('./domain-api',async()=>({...await vi.importActual('./domain-api'),domainRequest:request}));
vi.mock('@appbase/ui-react/auth.js',()=>({useOptionalAuth:()=>({loading:false,session})}));
vi.mock('../auth',()=>({authClient:{getSession:async()=>session}}));
const data={nickname:'До правок',about:'',pronouns:'',identity:'',orientation:'',relationships:'',city:''};
const profile={id:'91e9ee01-e4e2-4900-a7ad-144c46442390',data,revision:1,updatedAt:'2026-10-12T00:00:00Z'};
function mount(){return createMemoryRouter([{path:'/profile',element:<ProfilePage/>},{path:'/account',element:<h1>Аккаунт</h1>}],{initialEntries:['/profile']});}

it('holds an immutable save and blocks discard/navigation until a lost response is resolved',async()=>{
 request.mockReset().mockResolvedValueOnce({profile}).mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce({profile:{...profile,data:{...data,nickname:'Мои правки'},revision:2},replayed:true});
 const alert=vi.spyOn(window,'alert').mockImplementation(()=>{}),confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
 try{
  const router=mount();render(<RouterProvider router={router}/>);const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Редактировать профиль'}));
  const input=screen.getByRole('textbox',{name:'Как тебя называть'});await user.clear(input);await user.type(input,'Мои правки');
  await user.click(screen.getByRole('button',{name:'Сохранить профиль'}));
  await screen.findByText('Результат сохранения пока неизвестен');
  expect(input.matches(':disabled')).toBe(true);
  expect(screen.getByRole('button',{name:'Отмена'}).matches(':disabled')).toBe(true);
  expect(screen.getByRole('button',{name:'Загрузить данные из аккаунта'}).matches(':disabled')).toBe(true);
  await user.click(screen.getByRole('link',{name:'Аккаунт'}));
  expect(router.state.location.pathname).toBe('/profile');expect(alert).toHaveBeenCalledTimes(1);expect(confirm).not.toHaveBeenCalled();
  const command=request.mock.calls[1]![1];
  expect(command).toEqual({action:'profile.save',operationId:expect.any(String),expectedRevision:1,data:{...data,nickname:'Мои правки'}});
  await user.click(screen.getByRole('button',{name:'Повторить сохранение'}));
  await screen.findByText('Профиль сохранён в аккаунте.');expect(request.mock.calls[2]![1]).toBe(command);
  await user.click(screen.getByRole('link',{name:'Аккаунт'}));
  await waitFor(()=>expect(router.state.location.pathname).toBe('/account'));
 }finally{alert.mockRestore();confirm.mockRestore();}
});

it('reconciles a definite conflict without losing local edits or untouched remote fields',async()=>{
 const latest={...profile,data:{...data,city:'Новый город'},revision:2};
 request.mockReset().mockResolvedValueOnce({profile}).mockRejectedValueOnce(new DomainClientError('revision_conflict')).mockResolvedValueOnce({profile:latest}).mockImplementationOnce((_session,body)=>Promise.resolve({profile:{...latest,data:body.data,revision:3},replayed:false}));
 const router=mount();render(<RouterProvider router={router}/>);const user=userEvent.setup();
 await user.click(await screen.findByRole('button',{name:'Редактировать профиль'}));
 const input=screen.getByRole('textbox',{name:'Как тебя называть'});await user.clear(input);await user.type(input,'Мои правки');
 await user.click(screen.getByRole('button',{name:'Сохранить профиль'}));
 await user.click(await screen.findByRole('button',{name:'Обновить версию, сохранив мои правки'}));
 await screen.findByText('Версия аккаунта обновлена. Твои правки остались в форме — проверь их перед сохранением.');
 expect((input as HTMLInputElement).value).toBe('Мои правки');expect(input.matches(':disabled')).toBe(false);
 await user.click(screen.getByRole('button',{name:'Сохранить профиль'}));await screen.findByText('Профиль сохранён в аккаунте.');
 expect(request.mock.calls[3]![1]).toEqual({action:'profile.save',operationId:expect.any(String),expectedRevision:2,data:{...data,nickname:'Мои правки',city:'Новый город'}});
 expect(request.mock.calls[3]![1].operationId).not.toBe(request.mock.calls[1]![1].operationId);
});


it('retains the original pending save when a retry is denied before reaching the operation ledger',async()=>{
 request.mockReset().mockResolvedValueOnce({profile}).mockRejectedValueOnce(new Error('lost')).mockRejectedValueOnce(new DomainClientError('consent_required')).mockResolvedValueOnce({profile:{...profile,data:{...data,nickname:'Правки'},revision:2},replayed:true});
 const router=mount();render(<RouterProvider router={router}/>);const user=userEvent.setup();
 await user.click(await screen.findByRole('button',{name:'Редактировать профиль'}));
 const input=screen.getByRole('textbox',{name:'Как тебя называть'});await user.clear(input);await user.type(input,'Правки');
 await user.click(screen.getByRole('button',{name:'Сохранить профиль'}));
 await user.click(await screen.findByRole('button',{name:'Повторить сохранение'}));
 await screen.findByText('Прочитай актуальные документы и подтверди согласие.');
 expect(input.matches(':disabled')).toBe(true);
 expect(screen.getByRole('button',{name:'Отмена'}).matches(':disabled')).toBe(true);
 expect(screen.getByRole('button',{name:'Загрузить данные из аккаунта'}).matches(':disabled')).toBe(true);
 expect(screen.getByRole('link',{name:'Правила и согласия (в новом окне)'}).getAttribute('target')).toBe('_blank');
 await user.click(screen.getByRole('button',{name:'Повторить сохранение'}));await screen.findByText('Профиль сохранён в аккаунте.');
 expect(request.mock.calls[2]![1]).toBe(request.mock.calls[1]![1]);expect(request.mock.calls[3]![1]).toBe(request.mock.calls[1]![1]);
});
