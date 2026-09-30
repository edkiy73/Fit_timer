import { describe, expect, it } from 'vitest';
import { decideUpdate } from './app-update';

const direct={latestCode:1010,minimumCode:0,latestName:'0.1.10',url:'https://github.com/o/r/releases/download/unmute-apk-archive/UnMute-1010.apk',messageRu:'Новые курсы',messageEn:''};

describe('in-app update decision',()=>{
  it('offers a newer build of the same channel',()=>{
    const offer=decideUpdate({direct},'direct',1005,'ru');
    expect(offer).toMatchObject({level:'optional',channel:'direct',versionCode:1010,versionName:'0.1.10',message:'Новые курсы'});
  });

  it('stays quiet on the current build, without a link or for the other channel',()=>{
    expect(decideUpdate({direct},'direct',1010,'ru')).toBeNull();
    expect(decideUpdate({direct:{...direct,url:''}},'direct',1005,'ru')).toBeNull();
    expect(decideUpdate({direct:{...direct,url:'http://insecure'}},'direct',1005,'ru')).toBeNull();
    expect(decideUpdate({direct},'store',1005,'ru')).toBeNull();
    expect(decideUpdate(undefined,'direct',1005,'ru')).toBeNull();
  });

  it('requires the update below the minimum version',()=>{
    expect(decideUpdate({direct:{...direct,minimumCode:1008}},'direct',1005,'ru')?.level).toBe('required');
    expect(decideUpdate({direct:{...direct,minimumCode:1008}},'direct',1009,'ru')?.level).toBe('optional');
  });

  it('uses the store channel for store builds and picks the message by language',()=>{
    const store={latestCode:1010,url:'https://play.google.com/store/apps/details?id=app.unmute.english',messageRu:'',messageEn:'New courses'};
    const offer=decideUpdate({store},'store',1001,'en');
    expect(offer?.channel).toBe('store');
    expect(offer?.message).toBe('New courses');
  });
});
