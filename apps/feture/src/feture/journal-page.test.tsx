import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createMemoryRouter,RouterProvider} from 'react-router';
import {expect,it,vi} from 'vitest';
import {JournalPage} from './journal-page';
import {DomainClientError} from './domain-api';
const {request,session}=vi.hoisted(()=>({request:vi.fn(),session:{email:'journal@example.com',deviceId:'journal-device',syncToken:'journal-token'}}));
vi.mock('./domain-api',async()=>({...await vi.importActual('./domain-api'),domainRequest:request}));
vi.mock('@appbase/ui-react/auth.js',()=>({useOptionalAuth:()=>({loading:false,session})}));
vi.mock('../auth',()=>({authClient:{getSession:async()=>session}}));
const id='91e9ee01-e4e2-4900-a7ad-144c46442390';
const entry={id,title:'Мысль',text:'Личный текст',topicId:null,deleted:false,revision:1,createdAt:'2026-10-12T00:00:00Z',updatedAt:'2026-10-12T00:00:00Z'};
const history={id,interestId:'interest-1-1',revision:1,createdAt:entry.createdAt,entry:{interestId:'interest-1-1',stance:'curious',experience:'none',boundary:'none',boundaryNote:null,intensity:null,visibility:'private',useForDiscovery:false,revision:1,updatedAt:entry.updatedAt,source:'manual',testVersion:null,deleted:false}};
function mount(){const router=createMemoryRouter([{path:'/journal',element:<JournalPage/>},{path:'/',element:<h1>Главная</h1>}],{initialEntries:['/journal']});render(<RouterProvider router={router}/>);return router;}

it.each(['journal.delete','history.clear'])('retains an exact %s retry and blocks departure even without a dirty draft',async action=>{
 let removed=false,attempts=0;const commands:unknown[]=[];
 request.mockReset().mockImplementation((_session,body)=>{
  if(body.action==='journal.list')return Promise.resolve({items:removed?[]:[entry],nextCursor:null});
  if(body.action==='history.list')return Promise.resolve({items:removed?[]:[history],nextCursor:null});
  if(body.action!==action)throw new Error('unexpected action');
  commands.push(body);removed=true;
  if(++attempts===1)return Promise.reject(new Error('lost'));
  return Promise.resolve(action==='history.clear'?{cleared:1,replayed:true}:{entry:{...entry,title:'',text:'',topicId:null,deleted:true,revision:2},replayed:true});
 });
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
 try{
  const router=mount(),user=userEvent.setup();await screen.findByRole('heading',{name:'Твои записи'});
  if(action==='history.clear')await user.click(screen.getByRole('button',{name:'История карты'}));
  await user.click(await screen.findByRole('button',{name:action==='history.clear'?'Удалить историю карты':'Удалить'}));
  await screen.findByText('Результат действия пока неизвестен');
  expect(screen.getByRole('button',{name:'Обновить список'}).matches(':disabled')).toBe(true);
  expect(screen.getByRole('button',{name:'Дневник'}).matches(':disabled')).toBe(true);
  await user.click(screen.getByRole('link',{name:'← Мой мир'}));
  await screen.findByRole('dialog',{name:'Результат действия ещё не подтверждён'});
  expect(screen.queryByRole('button',{name:'Выйти без сохранения'})).toBeNull();expect(router.state.location.pathname).toBe('/journal');
  await user.click(screen.getByRole('button',{name:'Остаться'}));
  await user.click(screen.getByRole('button',{name:'Повторить то же действие'}));
  await screen.findByText(action==='history.clear'?'Очистка истории подтверждена. Изменения после этого действия остаются.':'Запись удалена.');
  expect(commands[1]).toBe(commands[0]);
  expect(commands[0]).toEqual(action==='history.clear'?{action,operationId:expect.any(String)}:{action,id,expectedRevision:1,operationId:expect.any(String)});
  await waitFor(()=>expect(screen.getByRole('button',{name:'Обновить список'}).matches(':disabled')).toBe(false));
  await user.click(screen.getByRole('link',{name:'← Мой мир'}));await waitFor(()=>expect(router.state.location.pathname).toBe('/'));
 }finally{confirm.mockRestore();}
});

it('keeps the pending save through a preflight rejection, then accepts a tombstone replay without resurrection',async()=>{
 let attempts=0;const commands:unknown[]=[];
 request.mockReset().mockImplementation((_session,body)=>{
  if(body.action==='journal.list')return Promise.resolve({items:[],nextCursor:null});
  commands.push(body);
  if(++attempts===1)return Promise.reject(new Error('lost'));
  if(attempts===2)return Promise.reject(new DomainClientError('consent_required'));
  return Promise.resolve({entry:{...entry,id:body.id,title:'',text:'',deleted:true,revision:2},replayed:true});
 });
 mount();const user=userEvent.setup(),text=await screen.findByRole('textbox',{name:'Твои мысли'});
 await user.type(text,'Сохранить мысль');await user.click(screen.getByRole('button',{name:'Сохранить запись'}));
 await user.click(await screen.findByRole('button',{name:'Повторить то же действие'}));
 await screen.findByText('Прочитай актуальные документы и подтверди согласие.');
 expect(text.matches(':disabled')).toBe(true);expect(screen.getByRole('button',{name:'Очистить форму'}).matches(':disabled')).toBe(true);
 await user.click(screen.getByRole('button',{name:'Повторить то же действие'}));await screen.findByText('Эта запись уже удалена.');
 expect(commands[1]).toBe(commands[0]);expect(commands[2]).toBe(commands[0]);
 const empty=await screen.findByRole('textbox',{name:'Твои мысли'});expect((empty as HTMLTextAreaElement).value).toBe('');
});

it.each(['revision_conflict','resource_not_found','journal_limit'])('releases a definite %s rejection without discarding the local draft',async code=>{
 request.mockReset().mockImplementation((_session,body)=>body.action==='journal.list'?Promise.resolve({items:[],nextCursor:null}):Promise.reject(new DomainClientError(code)));
 mount();const user=userEvent.setup(),text=await screen.findByRole('textbox',{name:'Твои мысли'});
 await user.type(text,'Правки остаются');await user.click(screen.getByRole('button',{name:'Сохранить запись'}));
 await screen.findByRole('alert');await waitFor(()=>expect(text.matches(':disabled')).toBe(false));
 expect((text as HTMLTextAreaElement).value).toBe('Правки остаются');expect(screen.queryByRole('button',{name:'Повторить то же действие'})).toBeNull();
});
