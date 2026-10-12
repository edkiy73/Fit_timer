import {expect,it,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {AuthSession} from '@appbase/core/auth.js';
import type {PostEntry} from '../../lib/feture/posts';
import {PostPhotoDialog} from './post-photo';
const {request}=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('./domain-api',async()=>({...await vi.importActual('./domain-api'),domainRequest:request}));
const session={email:'photo@example.com',deviceId:'photo-test',syncToken:'photo-token'} as AuthSession;
const post={id:'91e9ee01-e4e2-4900-a7ad-144c46442390',text:'Текст',kind:'text',authorLabel:'Автор',audience:'private',plannedAudience:'public',recipientCodes:[],state:'draft',revision:2,createdAt:'2026-10-12T00:00:00Z',updatedAt:'2026-10-12T00:00:00Z',publishedAt:null,mine:true} as PostEntry;
it.each(['verification_required','consent_required','domain_unavailable'])('allows withdrawal without displaying bytes when reading fails: %s',async code=>{
 request.mockReset().mockRejectedValueOnce({code}).mockResolvedValueOnce({entry:{...post,revision:3},replayed:false});
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true),saved=vi.fn(),pending=vi.fn();
 try{
  render(<PostPhotoDialog session={session} post={post} onClose={vi.fn()} onSaved={saved} onPendingChange={pending}/>);
  const remove=await screen.findByRole('button',{name:'Удалить фото без просмотра'});
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByLabelText('Выбрать снимок').matches(':disabled')).toBe(true);
  await userEvent.setup().click(remove);
  await waitFor(()=>expect(saved).toHaveBeenCalledWith({...post,revision:3}));
  expect(request.mock.calls[1]![1]).toEqual({action:'photo.remove',id:post.id,expectedRevision:2,operationId:expect.any(String)});
  expect(pending).toHaveBeenLastCalledWith(false);
 }finally{confirm.mockRestore();}
});
it('retries the identical removal after a lost response without needing photo bytes',async()=>{
 request.mockReset().mockRejectedValueOnce({code:'domain_unavailable'}).mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce({entry:{...post,revision:3},replayed:true});
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true),saved=vi.fn(),close=vi.fn();
 try{
  render(<PostPhotoDialog session={session} post={post} onClose={close} onSaved={saved} onPendingChange={vi.fn()}/>);
  const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Удалить фото без просмотра'}));
  const retry=await screen.findByRole('button',{name:'Повторить то же действие'});
  await user.click(screen.getAllByRole('button',{name:'Закрыть'})[0]!);
  expect(close).not.toHaveBeenCalled();
  expect(screen.getAllByRole('button',{name:'Закрыть'}).some(button=>button.matches(':disabled'))).toBe(true);
  await user.click(retry);await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[2]![1]).toBe(request.mock.calls[1]![1]);
  expect(close).not.toHaveBeenCalled();expect(screen.queryByRole('img')).toBeNull();
 }finally{confirm.mockRestore();}
});
