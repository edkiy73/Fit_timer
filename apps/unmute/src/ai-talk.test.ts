import { afterEach, describe, expect, it, vi } from 'vitest';
import { authClient } from './auth';
import {
  clearTalkTrialContext,
  getTalkTrialContext,
  requestTalkReply,
  requestTalkReview,
  talkReplyProtocol,
  TalkAIError
} from './ai-talk';

afterEach(()=>{
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AI talk client',()=>{
  it('keeps one trial id for the same conversation within the browser session',()=>{
    const values=new Map<string,string>();
    const storage={
      getItem:(key:string)=>values.get(key)??null,
      setItem:(key:string,value:string)=>{values.set(key,value);},
      removeItem:(key:string)=>{values.delete(key);}
    };

    const first=getTalkTrialContext('talk.clinic',storage);
    const resumed=getTalkTrialContext('talk.clinic',storage);
    expect(resumed).toEqual(first);

    clearTalkTrialContext('talk.clinic',storage);
    const next=getTalkTrialContext('talk.clinic',storage);
    expect(next.scope).toBe('talk.clinic');
    expect(next.id).not.toBe(first.id);
  });


  it('parses the strict reply protocol',()=>{
    expect(talkReplyProtocol.parseReplyText(JSON.stringify({
      reply:'How can I help you?',
      correction:'I need some medicine.',
      note:'Артикль здесь звучит естественнее.'
    }))).toEqual({
      reply:'How can I help you?',
      correction:'I need some medicine.',
      note:'Артикль здесь звучит естественнее.'
    });
  });

  it('parses the strict review protocol',()=>{
    expect(talkReplyProtocol.parseReviewText(JSON.stringify({
      strengths:['Ты держал тему.'],
      corrections:[{
        original:'I need medicine',
        better:'I need some medicine.',
        why:'Так естественнее.'
      }],
      focus:'Потренируй some перед неисчисляемыми существительными.'
    }))).toEqual({
      strengths:['Ты держал тему.'],
      corrections:[{
        original:'I need medicine',
        better:'I need some medicine.',
        why:'Так естественнее.'
      }],
      focus:'Потренируй some перед неисчисляемыми существительными.'
    });
  });

  it('requires a signed-in account before spending AI quota',async()=>{
    vi.spyOn(authClient,'authFields').mockResolvedValue(null);

    await expect(requestTalkReply({
      topic:'Pharmacy',
      promptTemplate:'You are a pharmacist.',
      focus:[],
      history:[],
      learnerText:'Hello',
      locale:'ru'
    })).rejects.toMatchObject({
      name:'TalkAIError',
      code:'auth_required',
      status:401
    });
  });

  it('can request a server-built opening turn without inventing a learner message',async()=>{
    vi.spyOn(authClient,'authFields').mockResolvedValue({
      email:'user@example.com',
      deviceId:'device',
      syncToken:'token'
    });
    const fetchMock=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
      const body=JSON.parse(String(init?.body||'{}'));
      expect(body).toMatchObject({
        kind:'talk.reply',
        topic:'At the bank',
        learnerText:'',
        start:true
      });
      return new Response(JSON.stringify({
        ok:true,
        text:JSON.stringify({
          reply:'Good morning. How can I help you?',
          correction:null,
          note:null
        })
      }),{
        status:200,
        headers:{'Content-Type':'application/json'}
      });
    });
    vi.stubGlobal('fetch',fetchMock);

    await expect(requestTalkReply({
      topic:'At the bank',
      promptTemplate:'Act as a bank clerk.',
      focus:[],
      history:[],
      learnerText:'',
      locale:'en',
      start:true
    })).resolves.toMatchObject({
      reply:'Good morning. How can I help you?',
      correction:null,
      note:null
    });
  });

  it('sends only structured conversation context and returns usage',async()=>{
    vi.spyOn(authClient,'authFields').mockResolvedValue({
      email:'user@example.com',
      deviceId:'device',
      syncToken:'token'
    });
    const fetchMock=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
      const body=JSON.parse(String(init?.body||'{}'));
      expect(body).toMatchObject({
        kind:'talk.reply',
        prompt:'unmute:talk.reply',
        topic:'At the pharmacy',
        learnerText:'I need something for a headache',
        locale:'ru',
        trial:{id:'trial_abcdefghijklmnop',scope:'talk.pharmacy'}
      });
      expect(body.history).toEqual([{role:'partner',text:'How can I help?'}]);
      return new Response(JSON.stringify({
        ok:true,
        text:JSON.stringify({
          reply:'How long have you had the headache?',
          correction:null,
          note:null
        }),
        usage:{bucket:'light',used:2,limit:100},
        access:{mode:'trial',remaining:8,maxCalls:10}
      }),{
        status:200,
        headers:{'Content-Type':'application/json'}
      });
    });
    vi.stubGlobal('fetch',fetchMock);

    await expect(requestTalkReply({
      topic:'At the pharmacy',
      promptTemplate:'You are a pharmacist.',
      focus:['I need…'],
      history:[{role:'partner',text:'How can I help?'}],
      learnerText:'I need something for a headache',
      locale:'ru',
      trial:{id:'trial_abcdefghijklmnop',scope:'talk.pharmacy'}
    })).resolves.toEqual({
      reply:'How long have you had the headache?',
      correction:null,
      note:null,
      usage:{bucket:'light',used:2,limit:100},
      trial:{remaining:8,maxCalls:10}
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/ai',expect.any(Object));
  });

  it('requests a server-built whole-conversation review',async()=>{
    vi.spyOn(authClient,'authFields').mockResolvedValue({
      email:'user@example.com',
      deviceId:'device',
      syncToken:'token'
    });
    const fetchMock=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
      const body=JSON.parse(String(init?.body||'{}'));
      expect(body).toMatchObject({
        kind:'talk.review',
        prompt:'unmute:talk.review',
        topic:'At the pharmacy',
        locale:'ru',
        trial:{id:'trial_abcdefghijklmnop',scope:'talk.pharmacy'}
      });
      expect(body.history).toEqual([
        {role:'partner',text:'How can I help?'},
        {role:'learner',text:'I need medicine'}
      ]);
      return new Response(JSON.stringify({
        ok:true,
        text:JSON.stringify({
          strengths:['Ты быстро сформулировал просьбу.'],
          corrections:[],
          focus:'Добавляй артикли там, где они нужны.'
        }),
        usage:{bucket:'light',used:3,limit:100},
        access:{mode:'trial',remaining:7,maxCalls:10}
      }),{
        status:200,
        headers:{'Content-Type':'application/json'}
      });
    });
    vi.stubGlobal('fetch',fetchMock);

    await expect(requestTalkReview({
      topic:'At the pharmacy',
      promptTemplate:'You are a pharmacist.',
      focus:['I need…'],
      history:[
        {role:'partner',text:'How can I help?'},
        {role:'learner',text:'I need medicine'}
      ],
      locale:'ru',
      trial:{id:'trial_abcdefghijklmnop',scope:'talk.pharmacy'}
    })).resolves.toEqual({
      strengths:['Ты быстро сформулировал просьбу.'],
      corrections:[],
      focus:'Добавляй артикли там, где они нужны.',
      usage:{bucket:'light',used:3,limit:100},
      trial:{remaining:7,maxCalls:10}
    });
  });

  it('keeps server access errors machine-readable for the future chat UI',async()=>{
    vi.spyOn(authClient,'authFields').mockResolvedValue({
      email:'user@example.com',
      deviceId:'device',
      syncToken:'token'
    });
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({
      ok:false,
      error:'premium_required'
    }),{
      status:402,
      headers:{'Content-Type':'application/json'}
    })));

    let thrown:unknown;
    try{
      await requestTalkReply({
        topic:'Bank',
        promptTemplate:'',
        focus:[],
        history:[],
        learnerText:'I want open account',
        locale:'en'
      });
    }catch(error){thrown=error;}
    expect(thrown).toBeInstanceOf(TalkAIError);
    expect(thrown).toMatchObject({code:'premium_required',status:402});
  });
});
