import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createMemoryRouter,RouterProvider} from 'react-router';
import {expect,it,vi} from 'vitest';
import seeds from '../../data/questionnaires.json';
import {QuestionnairesPage} from './questionnaire-page';

const {request,session}=vi.hoisted(()=>({
 request:vi.fn(),
 session:{email:'test@example.com',deviceId:'test-device',syncToken:'test-token'}
}));
vi.mock('./domain-api',async()=>({...await vi.importActual('./domain-api'),domainRequest:request}));
vi.mock('@appbase/ui-react/auth.js',()=>({useOptionalAuth:()=>({loading:false,session})}));
vi.mock('./test-share-preview',()=>({TestSharePreview:()=>null}));
vi.mock('./test-map-preview',()=>({TestMapPreview:()=>null}));

const attemptId='91e9ee01-e4e2-4900-a7ad-144c46442390';
const definition=seeds[0]!;
const attempt={
 id:attemptId,version:{id:'91e9ee01-e4e2-4900-a7ad-144c46442391',
 testId:definition.id,revision:1,definition,publishedAt:'2026-10-12T00:00:00Z'},
 status:'draft',answers:{},position:0,revision:1,result:null,updatedAt:'2026-10-12T00:00:00Z'
};
function mount(){
 const router=createMemoryRouter([
  {path:'/tests/:attemptId',element:<QuestionnairesPage/>},
  {path:'/explore',element:<h1>Исследовать</h1>}
 ],{initialEntries:['/tests/'+attemptId]});
 render(<RouterProvider router={router}/>);
 return router;
}

it('retains the exact questionnaire save after a lost response and blocks unsafe reload or exit',async()=>{
 const sent:unknown[]=[];
 request.mockReset().mockImplementation((_session,command)=>{
  if(command.action==='tests.read')return Promise.resolve({attempt});
  if(command.action!=='tests.save')throw new Error('unexpected action');
  sent.push(command);
  if(sent.length===1)return Promise.reject(new Error('lost response'));
  return Promise.resolve({attempt:{...attempt,revision:2,answers:command.answers,position:command.position}});
 });
 const router=mount(),user=userEvent.setup();
 await screen.findByText('Вопрос 1 из '+definition.questions.length,{exact:false});
 await waitFor(()=>expect(document.querySelector('.ft-question-choice input:not(:disabled)')).not.toBeNull());
 await user.click(document.querySelector('.ft-question-choice input') as HTMLElement);
 const save=screen.getByRole('button',{name:'Сохранить и продолжить позже'});
 await waitFor(()=>expect(save.matches(':disabled')).toBe(false));
 await user.click(save);
 await screen.findByText('Результат действия пока неизвестен.',{exact:false});
 expect(screen.getByRole('button',{name:'Загрузить сохранённое'}).matches(':disabled')).toBe(true);
 expect(document.querySelector('.ft-question-choice input:disabled')).not.toBeNull();
 await user.click(screen.getByRole('link',{name:'← Исследовать'}));
 await screen.findByRole('dialog',{name:'Результат действия ещё не подтверждён'});
 expect(router.state.location.pathname).toBe('/tests/'+attemptId);
 expect(screen.queryByRole('button',{name:'Уйти без сохранения'})).toBeNull();
 await user.click(screen.getByRole('button',{name:'Повторить то же действие'}));
 await screen.findByText('Ответы сохранены. Можно продолжить позже.');
 expect(sent).toHaveLength(2);
 expect(sent[1]).toBe(sent[0]);
 expect(sent[0]).toEqual({action:'tests.save',attemptId,operationId:expect.any(String),
  expectedRevision:1,answers:expect.any(Object),position:0});
 await user.click(screen.getByRole('link',{name:'← Исследовать'}));
 await waitFor(()=>expect(router.state.location.pathname).toBe('/explore'));
});
