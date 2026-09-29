import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  nativeSpeechAvailable,
  speakText,
  startRecognition
} from './speech-runtime';

function setCapacitor(plugin:Record<string,unknown>|undefined){
  (globalThis as unknown as {Capacitor?:unknown}).Capacitor=plugin
    ? {
        isNativePlatform:()=>true,
        Plugins:{UnMuteAudio:plugin}
      }
    : undefined;
}

afterEach(()=>{
  setCapacitor(undefined);
  vi.restoreAllMocks();
});

describe('UnMute speech runtime',()=>{
  it('does not mistake FitTimer command audio for the UnMute dictation plugin',()=>{
    (globalThis as unknown as {Capacitor?:unknown}).Capacitor={
      isNativePlatform:()=>true,
      Plugins:{FitAudio:{}}
    };
    expect(nativeSpeechAvailable()).toBe(false);
  });

  it('uses native TTS when the dedicated UnMute plugin is present',async()=>{
    const speak=vi.fn(async()=>({spoken:true}));
    setCapacitor({speak});

    expect(nativeSpeechAvailable()).toBe(true);
    await expect(speakText('hello','en-US')).resolves.toBe(true);
    expect(speak).toHaveBeenCalledWith({
      text:'hello',
      locale:'en-US',
      voice:''
    });
  });

  it('passes native dictation alternatives through the existing learner contract',async()=>{
    let resultListener:((event:Record<string,unknown>)=>void)|null=null;
    const remove=vi.fn(async()=>{});
    const addListener=vi.fn(async(name:string,listener:(event:Record<string,unknown>)=>void)=>{
      if(name==='speechResult')resultListener=listener;
      return {remove};
    });
    const startNative=vi.fn(async()=>({started:true}));
    const stopNative=vi.fn(async()=>{});
    setCapacitor({
      requestMicrophone:async()=>({granted:true}),
      addListener,
      startRecognition:startNative,
      stopRecognition:stopNative
    });

    const onResult=vi.fn();
    const handle=startRecognition({onResult},'en-US');
    await Promise.resolve();
    await Promise.resolve();

    expect(handle).not.toBeNull();
    expect(startNative).toHaveBeenCalledWith({language:'en-US'});
    expect(resultListener).not.toBeNull();
    (resultListener as unknown as (event:Record<string,unknown>)=>void)({
      text:'I am home',
      alternatives:['I am home','I’m home']
    });
    expect(onResult).toHaveBeenCalledWith(['I am home','I’m home']);

    handle?.abort();
    await Promise.resolve();
    expect(stopNative).toHaveBeenCalled();
  });
});
