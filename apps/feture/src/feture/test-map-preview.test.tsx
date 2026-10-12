import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {TestMapPreview} from './test-map-preview';

const {request,sync}=vi.hoisted(()=>({request:vi.fn(),sync:vi.fn()}));
vi.mock('./domain-api',async()=>({...await vi.importActual('./domain-api'),domainRequest:request}));
vi.mock('./use-interest-map',()=>({
 useInterestMap:()=>({phase:'synced',pending:0,conflicts:[]}),
 interestQueue:{sync}
}));

const id='91e9ee01-e4e2-4900-a7ad-144c46442390';
const session={email:'owner@example.com',deviceId:'device',syncToken:'token',handle:'',locale:'ru',sub:null,premium:false,owned:[],fresh:false};
const preview={ok:true,attemptId:id,versionId:id,requestId:id,items:[{
 interestId:'interest-1-1',title:'Тема',reason:'Есть повод обдумать',dimensionId:'reflection',
 available:true,blockedReason:null,
 next:{stance:'curious',experience:'unspecified',boundary:'none',boundaryNote:null,
  intensity:null,visibility:'private',useForDiscovery:false}
}]};

it('keeps the exact map apply after a lost response and does not allow discarding it',async()=>{
 const commands:unknown[]=[];
 const onPendingChange=vi.fn(),onClose=vi.fn();
 request.mockReset().mockImplementation((_session,body)=>{
  if(body.action==='tests.mapPreview')return Promise.resolve(preview);
  if(body.action!=='tests.mapApply')throw new Error('unexpected operation');
  commands.push(body);
  if(commands.length===1)return Promise.reject(new Error('lost response'));
  return Promise.resolve({ok:true,replayed:true,applied:1,requestId:id});
 });
 const user=userEvent.setup();
 render(<TestMapPreview session={session} attemptId={id} onClose={onClose} onPendingChange={onPendingChange}/>);
 await user.click(await screen.findByRole('checkbox',{name:'Тема'}));
 await user.click(screen.getByRole('button',{name:'Добавить выбранные темы'}));
 await screen.findByText(/Результат сохранения пока неизвестен/);
 expect(screen.getByRole('button',{name:'Проверить предложения заново'}).matches(':disabled')).toBe(true);
 expect(screen.getByRole('button',{name:'Отмена'}).matches(':disabled')).toBe(true);
 expect(onPendingChange).toHaveBeenCalledWith(true);
 await user.click(screen.getByRole('button',{name:'Повторить то же сохранение'}));
 await screen.findByText('Добавлено тем: 1. Они видны только тебе.');
 expect(commands).toHaveLength(2);
 expect(commands[0]).toBe(commands[1]);
 expect(onPendingChange).toHaveBeenLastCalledWith(false);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Готово'}).matches(':disabled')).toBe(false));
 await user.click(screen.getByRole('button',{name:'Готово'}));
 expect(onClose).toHaveBeenCalledOnce();
});
