import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,waitFor} from '@testing-library/react';
import {VideoPlayer,VoiceBubble} from './av';
import {PhotoTrack} from './domain';

vi.mock('@appbase/ui-react/i18n.js',()=>({useI18n:()=>({t:(key:string)=>key})}));
let intersect:IntersectionObserverCallback;
beforeEach(()=>{
 vi.spyOn(HTMLMediaElement.prototype,'play').mockImplementation(function(this:HTMLMediaElement){
  this.dispatchEvent(new Event('play'));return Promise.resolve();
 });
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
 vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});
 vi.stubGlobal('IntersectionObserver',class {
  constructor(cb:IntersectionObserverCallback){intersect=cb;}
  observe=vi.fn();disconnect=vi.fn();
 });
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('media transfer and short-lived access',()=>{
 it('does not attach remote video bytes until play; re-renders keep the same source',()=>{
  const {container,rerender}=render(<VideoPlayer src="https://media.test/clip?token=1" poster="https://media.test/poster"/>);
  const video=container.querySelector('video')!;
  expect(video.getAttribute('src')).toBeNull();
  fireEvent.click(container.querySelector('.k-vplay')!);
  expect(video.getAttribute('src')).toBe('https://media.test/clip?token=1');
  rerender(<VideoPlayer src="https://media.test/clip?token=1" poster="https://media.test/poster"/>);
  expect(video.getAttribute('src')).toBe('https://media.test/clip?token=1');
 });
 it('drops the old capability on a changed URL without prefetching the new private file',()=>{
  const {container,rerender,unmount}=render(<VideoPlayer src="https://media.test/old"/>);
  const video=container.querySelector('video')!;
  fireEvent.click(container.querySelector('.k-vplay')!);
  rerender(<VideoPlayer src="https://media.test/new"/>);
  expect(video.getAttribute('src')).toBeNull();
  fireEvent.click(container.querySelector('.k-vplay')!);
  expect(video.getAttribute('src')).toBe('https://media.test/new');
  unmount();
  expect(video.getAttribute('src')).toBeNull();
  expect(video.pause).toHaveBeenCalled();
 });
 it('autoplays the active viewer clip and pauses when scrolled out',async()=>{
  const {container}=render(<VideoPlayer src="https://media.test/clip" autoPlay/>);
  const video=container.querySelector('video')!;
  await waitFor(()=>expect(video.getAttribute('src')).toBe('https://media.test/clip'));
  vi.mocked(video.pause).mockClear();
  intersect([{isIntersecting:false} as IntersectionObserverEntry],{} as IntersectionObserver);
  expect(video.pause).toHaveBeenCalledOnce();
 });
 it('voice messages attach bytes only after listen and release them on unmount',()=>{
  const {container,unmount}=render(<VoiceBubble src="https://media.test/voice" durationMs={3000}/>);
  const audio=container.querySelector('audio')!;
  expect(audio.getAttribute('src')).toBeNull();
  fireEvent.click(container.querySelector('button')!);
  expect(audio.getAttribute('src')).toBe('https://media.test/voice');
  unmount();expect(audio.getAttribute('src')).toBeNull();
 });
 it('a gallery requests only the current photo and its neighbours; distant video stays disconnected',()=>{
  const srcs=['/a.webp','/b.webp','/c.webp','/d.webp',{video:'/e.mp4',poster:'/e.webp'}];
  const {container,rerender}=render(<PhotoTrack srcs={srcs} index={0}/>);
  expect([...container.querySelectorAll('img')].map(i=>i.getAttribute('src'))).toEqual(['/a.webp','/b.webp']);
  expect(container.querySelector('video')).toBeNull();
  rerender(<PhotoTrack srcs={srcs} index={2}/>);
  expect([...container.querySelectorAll('img')].map(i=>i.getAttribute('src'))).toEqual(['/b.webp','/c.webp','/d.webp']);
 });
});
